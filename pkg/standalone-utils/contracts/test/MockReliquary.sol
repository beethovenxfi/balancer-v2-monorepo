// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-interfaces/contracts/liquidity-mining/IReliquary.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/SafeERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC721Enumerable.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC721.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ReentrancyGuard.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ERC721.sol";

contract MockReliquary is IReliquary, ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Indicates whether tokens are being added to, or removed from, a pool
    enum Kind {
        DEPOSIT,
        WITHDRAW,
        OTHER
    }

    uint256 private constant ACC_REWARD_PRECISION = 1e12;

    uint256 private nonce;

    /// @notice Address of the reward token contract.
    IERC20 public immutable override rewardToken;
    /// @notice Address of each NFTDescriptor contract.
    INFTDescriptor[] public override nftDescriptor;
    /// @notice Address of EmissionCurve contract.
    IEmissionCurve public override emissionCurve;

    PoolInfo[] private poolInfo;

    LevelInfo[] private levels;
    /// @notice Address of the LP token for each Reliquary pool.
    IERC20[] public override poolToken;
    /// @notice Address of each `IRewarder` contract.
    IRewarder[] public override rewarder;

    mapping(uint256 => PositionInfo) private positionForId;

    /// @dev Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public override totalAllocPoint;

    event CreateRelic(uint256 indexed pid, address indexed to, uint256 indexed relicId);
    event Deposit(uint256 indexed pid, uint256 amount, address indexed to, uint256 indexed relicId);
    event Withdraw(uint256 indexed pid, uint256 amount, address indexed to, uint256 indexed relicId);
    event EmergencyWithdraw(uint256 indexed pid, uint256 amount, address indexed to, uint256 indexed relicId);
    event Harvest(uint256 indexed pid, uint256 amount, address indexed to, uint256 indexed relicId);
    event LogPoolAddition(
        uint256 indexed pid,
        uint256 allocPoint,
        IERC20 indexed poolToken,
        IRewarder indexed rewarder,
        INFTDescriptor nftDescriptor
    );
    event LogPoolModified(
        uint256 indexed pid,
        uint256 allocPoint,
        IRewarder indexed rewarder,
        INFTDescriptor nftDescriptor
    );
    event LogUpdatePool(uint256 indexed pid, uint256 lastRewardTime, uint256 lpSupply, uint256 accRewardPerShare);
    event LogSetEmissionCurve(IEmissionCurve indexed emissionCurveAddress);
    event LevelChanged(uint256 indexed relicId, uint256 newLevel);
    event Split(uint256 indexed fromId, uint256 indexed toId, uint256 amount);
    event Shift(uint256 indexed fromId, uint256 indexed toId, uint256 amount);
    event Merge(uint256 indexed fromId, uint256 indexed toId, uint256 amount);

    /*
     + @notice Constructs and initializes the contract
     + @param _rewardToken The reward token contract address.
     + @param _emissionCurve The contract address for the EmissionCurve, which will return the emission rate
    */
    constructor(IERC20 _rewardToken, IEmissionCurve _emissionCurve) ERC721("Reliquary Deposit", "RELIC") {
        rewardToken = _rewardToken;
        emissionCurve = _emissionCurve;
    }

    /// @notice Implement ERC165 to return which interfaces this contract conforms to
    function supportsInterface(bytes4 interfaceId) public view override(IERC165, ERC165) returns (bool) {
        return interfaceId == type(IReliquary).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @notice Returns the number of Reliquary pools.
    function poolLength() public view override returns (uint256 pools) {
        pools = poolInfo.length;
    }

    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) {
        require(_exists(tokenId), "token does not exist");
        return nftDescriptor[positionForId[tokenId].poolId].constructTokenURI(tokenId);
    }

    /// @param _emissionCurve The contract address for EmissionCurve, which will return the base emission rate
    function setEmissionCurve(IEmissionCurve _emissionCurve) external override {
        emissionCurve = _emissionCurve;
        emit LogSetEmissionCurve(_emissionCurve);
    }

    function getPositionForId(uint256 relicId) external view override returns (PositionInfo memory position) {
        position = positionForId[relicId];
    }

    function getPoolInfo(uint256 pid) external view override returns (PoolInfo memory pool) {
        pool = poolInfo[pid];
    }

    function getLevelInfo(uint256 pid) external view override returns (LevelInfo memory levelInfo) {
        levelInfo = levels[pid];
    }

    function burn(uint256 tokenId) public override(IReliquary) {
        require(positionForId[tokenId].amount == 0, "contains deposit");
        require(pendingReward(tokenId) == 0, "contains pending rewards");
        super._burn(tokenId);
    }

    /*
     + @notice Add a new pool for the specified LP.
     +         Can only be called by an operator.
     +
     + @param allocPoint The allocation points for the new pool
     + @param _poolToken Address of the pooled ERC-20 token
     + @param _rewarder Address of the rewarder delegate
     + @param requiredMaturity Array of maturity (in seconds) required to achieve each level for this pool
     + @param allocPoints The allocation points for each level within this pool
     + @param name Name of pool to be displayed in NFT image
     + @param _nftDescriptor The contract address for NFTDescriptor, which will return the token URI
    */
    function addPool(
        uint256 allocPoint,
        IERC20 _poolToken,
        IRewarder _rewarder,
        uint256[] calldata requiredMaturity,
        uint256[] calldata allocPoints,
        string memory name,
        INFTDescriptor _nftDescriptor
    ) external override {
        require(_poolToken != rewardToken, "cannot add reward token as pool");
        require(requiredMaturity.length != 0, "empty levels array");
        require(requiredMaturity.length == allocPoints.length, "array length mismatch");
        require(requiredMaturity[0] == 0, "requiredMaturity[0] != 0");
        if (requiredMaturity.length > 1) {
            uint256 highestMaturity;
            for (uint256 i = 1; i < requiredMaturity.length; i = _uncheckedInc(i)) {
                require(requiredMaturity[i] > highestMaturity, "unsorted levels array");
                highestMaturity = requiredMaturity[i];
            }
        }

        uint256 length = poolLength();
        for (uint256 i; i < length; i = _uncheckedInc(i)) {
            _updatePool(i);
        }

        uint256 totalAlloc = totalAllocPoint + allocPoint;
        require(totalAlloc != 0, "totalAllocPoint cannot be 0");
        totalAllocPoint = totalAlloc;
        poolToken.push(_poolToken);
        rewarder.push(_rewarder);
        nftDescriptor.push(_nftDescriptor);

        poolInfo.push(
            PoolInfo({ allocPoint: allocPoint, lastRewardTime: block.timestamp, accRewardPerShare: 0, name: name })
        );
        levels.push(
            LevelInfo({
                requiredMaturity: requiredMaturity,
                allocPoint: allocPoints,
                balance: new uint256[](allocPoints.length)
            })
        );

        emit LogPoolAddition((poolToken.length - 1), allocPoint, _poolToken, _rewarder, _nftDescriptor);
    }

    /*
     + @notice Modify the given pool's properties.
     +         Can only be called by the owner.
     +
     + @param pid The index of the pool. See `poolInfo`.
     + @param allocPoint New AP of the pool.
     + @param _rewarder Address of the rewarder delegate.
     + @param name Name of pool to be displayed in NFT image
     + @param overwriteRewarder True if _rewarder should be set. Otherwise `_rewarder` is ignored.
     + @param _nftDescriptor The contract address for NFTDescriptor, which will return the token URI
    */
    function modifyPool(
        uint256 pid,
        uint256 allocPoint,
        IRewarder _rewarder,
        string calldata name,
        INFTDescriptor _nftDescriptor,
        bool overwriteRewarder
    ) external override {
        require(pid < poolInfo.length, "set: pool does not exist");

        uint256 length = poolLength();
        for (uint256 i; i < length; i = _uncheckedInc(i)) {
            _updatePool(i);
        }

        PoolInfo storage pool = poolInfo[pid];
        uint256 totalAlloc = totalAllocPoint + allocPoint - pool.allocPoint;
        require(totalAlloc != 0, "totalAllocPoint cannot be 0");
        totalAllocPoint = totalAlloc;
        pool.allocPoint = allocPoint;

        if (overwriteRewarder) {
            rewarder[pid] = _rewarder;
        }

        pool.name = name;
        nftDescriptor[pid] = _nftDescriptor;

        emit LogPoolModified(pid, allocPoint, overwriteRewarder ? _rewarder : rewarder[pid], _nftDescriptor);
    }

    /*
     + @notice View function to see pending reward tokens on frontend.
     + @param relicId ID of the position.
     + @return pending reward amount for a given position owner.
    */
    function pendingReward(uint256 relicId) public view override returns (uint256 pending) {
        PositionInfo storage position = positionForId[relicId];
        uint256 poolId = position.poolId;
        PoolInfo storage pool = poolInfo[poolId];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = _poolBalance(position.poolId);

        uint256 lastRewardTime = pool.lastRewardTime;
        uint256 secondsSinceReward = block.timestamp - lastRewardTime;
        if (secondsSinceReward != 0 && lpSupply != 0) {
            uint256 reward = (secondsSinceReward * _baseEmissionsPerSecond(lastRewardTime) * pool.allocPoint) /
                totalAllocPoint;
            accRewardPerShare += (reward * ACC_REWARD_PRECISION) / lpSupply;
        }

        uint256 leveledAmount = position.amount * levels[poolId].allocPoint[position.level];
        pending =
            (leveledAmount * accRewardPerShare) /
            ACC_REWARD_PRECISION +
            position.rewardCredit -
            position.rewardDebt;
    }

    /*
     + @notice View function to see level of position if it were to be updated.
     + @param relicId ID of the position.
     + @return level Level for given position upon update.
    */
    function levelOnUpdate(uint256 relicId) public view override returns (uint256 level) {
        PositionInfo storage position = positionForId[relicId];
        LevelInfo storage levelInfo = levels[position.poolId];
        uint256 length = levelInfo.requiredMaturity.length;
        if (length == 1) {
            return 0;
        }

        uint256 maturity = block.timestamp - position.entry;
        for (level = length - 1; true; level = _uncheckedDec(level)) {
            if (maturity >= levelInfo.requiredMaturity[level]) {
                break;
            }
        }
    }

    /*
     + @notice Update reward variables for all pools. Be careful of gas spending!
     + @param pids Pool IDs of all to be updated. Make sure to update all active pools.
    */
    function massUpdatePools(uint256[] calldata pids) external override nonReentrant {
        for (uint256 i; i < pids.length; i = _uncheckedInc(i)) {
            _updatePool(pids[i]);
        }
    }

    /*
     + @notice Update reward variables of the given pool.
     + @param pid The index of the pool. See `poolInfo`.
     + @return pool Returns the pool that was updated.
    */
    function updatePool(uint256 pid) external override nonReentrant {
        _updatePool(pid);
    }

    /// @dev Internal _updatePool function without nonReentrant modifier
    function _updatePool(uint256 pid) internal returns (uint256 accRewardPerShare) {
        require(pid < poolLength(), "invalid pool ID");
        PoolInfo storage pool = poolInfo[pid];
        uint256 timestamp = block.timestamp;
        uint256 lastRewardTime = pool.lastRewardTime;
        uint256 secondsSinceReward = timestamp - lastRewardTime;

        accRewardPerShare = pool.accRewardPerShare;
        if (secondsSinceReward != 0) {
            uint256 lpSupply = _poolBalance(pid);

            if (lpSupply != 0) {
                uint256 reward = (secondsSinceReward * _baseEmissionsPerSecond(lastRewardTime) * pool.allocPoint) /
                    totalAllocPoint;
                accRewardPerShare += (reward * ACC_REWARD_PRECISION) / lpSupply;
                pool.accRewardPerShare = accRewardPerShare;
            }

            pool.lastRewardTime = timestamp;

            emit LogUpdatePool(pid, timestamp, lpSupply, accRewardPerShare);
        }
    }

    /*
     + @notice Create a new Relic NFT and deposit into this position
     + @param to Address to mint the Relic to
     + @param pid The index of the pool. See `poolInfo`.
     + @param amount Token amount to deposit.
    */
    function createRelicAndDeposit(
        address to,
        uint256 pid,
        uint256 amount
    ) external override nonReentrant returns (uint256 id) {
        require(pid < poolInfo.length, "invalid pool ID");
        id = _mint(to);
        positionForId[id].poolId = pid;
        _deposit(amount, id);
        emit CreateRelic(pid, to, id);
    }

    /*
     + @notice Deposit LP tokens to Reliquary for reward token allocation.
     + @param amount Token amount to deposit.
     + @param relicId NFT ID of the position being deposited to.
    */
    function deposit(uint256 amount, uint256 relicId) external override nonReentrant {
        _requireApprovedOrOwner(relicId);
        _deposit(amount, relicId);
    }

    /// @dev Internal deposit function that assumes relicId is valid.
    function _deposit(uint256 amount, uint256 relicId) internal {
        require(amount != 0, "depositing 0 amount");

        (uint256 poolId, ) = _updatePosition(amount, relicId, Kind.DEPOSIT, false);

        poolToken[poolId].safeTransferFrom(msg.sender, address(this), amount);

        emit Deposit(poolId, amount, ownerOf(relicId), relicId);
    }

    /*
     + @notice Withdraw LP tokens.
     + @param amount token amount to withdraw.
     + @param relicId NFT ID of the position being withdrawn.
    */
    function withdraw(uint256 amount, uint256 relicId) external override nonReentrant {
        require(amount != 0, "withdrawing 0 amount");
        _requireApprovedOrOwner(relicId);

        (uint256 poolId, ) = _updatePosition(amount, relicId, Kind.WITHDRAW, false);

        poolToken[poolId].safeTransfer(msg.sender, amount);

        emit Withdraw(poolId, amount, msg.sender, relicId);
    }

    /*
     + @notice Harvest proceeds for transaction sender to owner of `relicId`.
     + @param relicId NFT ID of the position being harvested.
    */
    function harvest(uint256 relicId) external override nonReentrant {
        _requireApprovedOrOwner(relicId);

        (uint256 poolId, uint256 _pendingReward) = _updatePosition(0, relicId, Kind.OTHER, true);

        emit Harvest(poolId, _pendingReward, msg.sender, relicId);
    }

    /*
     + @notice Withdraw LP tokens and harvest proceeds for transaction sender to owner of `relicId`.
     + @param amount token amount to withdraw.
     + @param relicId NFT ID of the position being withdrawn and harvested.
    */
    function withdrawAndHarvest(uint256 amount, uint256 relicId) external override nonReentrant {
        require(amount != 0, "withdrawing 0 amount");
        _requireApprovedOrOwner(relicId);

        (uint256 poolId, uint256 _pendingReward) = _updatePosition(amount, relicId, Kind.WITHDRAW, true);

        poolToken[poolId].safeTransfer(msg.sender, amount);

        emit Withdraw(poolId, amount, msg.sender, relicId);
        emit Harvest(poolId, _pendingReward, msg.sender, relicId);
    }

    /*
     + @notice Withdraw without caring about rewards. EMERGENCY ONLY.
     + @param relicId NFT ID of the position to emergency withdraw from and burn.
    */
    function emergencyWithdraw(uint256 relicId) external override nonReentrant {
        address to = ownerOf(relicId);
        require(to == msg.sender, "you do not own this position");

        PositionInfo storage position = positionForId[relicId];
        uint256 amount = position.amount;
        uint256 poolId = position.poolId;

        levels[poolId].balance[position.level] -= amount;

        _burn(relicId);
        delete positionForId[relicId];

        poolToken[poolId].safeTransfer(to, amount);

        emit EmergencyWithdraw(poolId, amount, to, relicId);
    }

    /// @notice Update position without performing a deposit/withdraw/harvest.
    /// @param relicId The NFT ID of the position being updated.
    function updatePosition(uint256 relicId) external override nonReentrant {
        _updatePosition(0, relicId, Kind.OTHER, false);
    }

    /*
     + @dev Internal function called whenever a position's state needs to be modified.
     + @param amount Amount of poolToken to deposit/withdraw.
     + @param relicId The NFT ID of the position being updated.
     + @param kind Indicates whether tokens are being added to, or removed from, a pool.
     + @param _harvest Whether a harvest should be performed.
     + @return pending reward for a given position owner.
    */
    function _updatePosition(
        uint256 amount,
        uint256 relicId,
        Kind kind,
        bool _harvest
    ) internal returns (uint256 poolId, uint256 _pendingReward) {
        PositionInfo storage position = positionForId[relicId];
        poolId = position.poolId;
        uint256 accRewardPerShare = _updatePool(poolId);

        uint256 oldAmount = position.amount;
        uint256 newAmount;
        if (kind == Kind.DEPOSIT) {
            _updateEntry(amount, relicId);
            newAmount = oldAmount + amount;
            position.amount = newAmount;
        } else if (kind == Kind.WITHDRAW) {
            newAmount = oldAmount - amount;
            position.amount = newAmount;
        } else {
            newAmount = oldAmount;
        }

        uint256 oldLevel = position.level;
        uint256 newLevel = _updateLevel(relicId);
        if (oldLevel != newLevel) {
            levels[poolId].balance[oldLevel] -= oldAmount;
            levels[poolId].balance[newLevel] += newAmount;
        } else if (kind == Kind.DEPOSIT) {
            levels[poolId].balance[oldLevel] += amount;
        } else if (kind == Kind.WITHDRAW) {
            levels[poolId].balance[oldLevel] -= amount;
        }

        _pendingReward =
            (oldAmount * levels[poolId].allocPoint[oldLevel] * accRewardPerShare) /
            ACC_REWARD_PRECISION -
            position.rewardDebt;
        position.rewardDebt =
            (newAmount * levels[poolId].allocPoint[newLevel] * accRewardPerShare) /
            ACC_REWARD_PRECISION;

        if (!_harvest && _pendingReward != 0) {
            position.rewardCredit += _pendingReward;
        } else if (_harvest) {
            uint256 total = _pendingReward + position.rewardCredit;
            uint256 received = _receivedReward(total);
            position.rewardCredit = total - received;
            if (received != 0) {
                rewardToken.safeTransfer(msg.sender, received);
                IRewarder _rewarder = rewarder[poolId];
                if (address(_rewarder) != address(0)) {
                    _rewarder.onReward(relicId, received);
                }
            }
        }

        if (kind == Kind.DEPOSIT) {
            IRewarder _rewarder = rewarder[poolId];
            if (address(_rewarder) != address(0)) {
                _rewarder.onDeposit(relicId, amount);
            }
        } else if (kind == Kind.WITHDRAW) {
            IRewarder _rewarder = rewarder[poolId];
            if (address(_rewarder) != address(0)) {
                _rewarder.onWithdraw(relicId, amount);
            }
        }
    }

    /// @notice Calculate how much the owner will actually receive on harvest, given available reward tokens
    /// @param _pendingReward Amount of reward token owed
    /// @return received The minimum between amount owed and amount available
    function _receivedReward(uint256 _pendingReward) internal view returns (uint256 received) {
        uint256 available = rewardToken.balanceOf(address(this));
        received = (available > _pendingReward) ? _pendingReward : available;
    }

    /// @notice Gets the base emission rate from external, upgradable contract
    function _baseEmissionsPerSecond(uint256 lastRewardTime) internal view returns (uint256 rate) {
        rate = emissionCurve.getRate(lastRewardTime);
        require(rate <= 6e18, "maximum emission rate exceeded");
    }

    /*
     + @notice Utility function to find weights without any underflows or zero division problems.
     + @param addedValue New value being added
     + @param oldValue Current amount of x
    */
    function _findWeight(uint256 addedValue, uint256 oldValue) internal pure returns (uint256 weightNew) {
        if (oldValue == 0) {
            weightNew = 1e18;
        } else {
            if (oldValue < addedValue) {
                uint256 weightOld = (oldValue * 1e18) / (addedValue + oldValue);
                weightNew = 1e18 - weightOld;
            } else if (addedValue < oldValue) {
                weightNew = (addedValue * 1e18) / (addedValue + oldValue);
            } else {
                weightNew = 1e18 / 2;
            }
        }
    }

    /*
     + @notice Updates the user's entry time based on the weight of their deposit or withdrawal
     + @param amount The amount of the deposit / withdrawal
     + @param relicId The NFT ID of the position being updated
    */
    function _updateEntry(uint256 amount, uint256 relicId) internal {
        PositionInfo storage position = positionForId[relicId];
        uint256 weight = _findWeight(amount, position.amount);
        uint256 maturity = block.timestamp - position.entry;
        position.entry += (maturity * weight) / 1e18;
    }

    /*
     + @notice Updates the position's level based on entry time
     + @param relicId The NFT ID of the position being updated
     + @return newLevel Level of position after update
    */
    function _updateLevel(uint256 relicId) internal returns (uint256 newLevel) {
        newLevel = levelOnUpdate(relicId);
        PositionInfo storage position = positionForId[relicId];
        if (position.level != newLevel) {
            position.level = newLevel;
            emit LevelChanged(relicId, newLevel);
        }
    }

    /*
     + @notice returns The total deposits of the pool's token, weighted by maturity level allocation.
     + @param pid The index of the pool. See `poolInfo`.
     + @return The amount of pool tokens held by the contract
    */
    function _poolBalance(uint256 pid) internal view returns (uint256 total) {
        LevelInfo storage levelInfo = levels[pid];
        uint256 length = levelInfo.balance.length;
        for (uint256 i; i < length; i = _uncheckedInc(i)) {
            total += levelInfo.balance[i] * levelInfo.allocPoint[i];
        }
    }

    /// @notice Require the sender is either the owner of the Relic or approved to transfer it
    /// @param relicId The NFT ID of the Relic
    function _requireApprovedOrOwner(uint256 relicId) internal view {
        require(_isApprovedOrOwner(msg.sender, relicId), "not owner or approved");
    }

    /// @dev Utility function to bypass overflow checking, saving gas
    function _uncheckedInc(uint256 i) internal pure returns (uint256) {
        return i + 1;
    }

    /// @dev Utility function to bypass underflow checking, saving gas
    function _uncheckedDec(uint256 i) internal pure returns (uint256) {
        return i - 1;
    }

    function _mint(address to) private returns (uint256 id) {
        id = ++nonce;
        _safeMint(to, id);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721) {
        ERC721._beforeTokenTransfer(from, to, tokenId);
    }
}
