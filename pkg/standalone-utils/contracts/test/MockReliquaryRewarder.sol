// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/SafeERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/liquidity-mining/IReliquary.sol";

contract MockReliquaryRewarder {
    using SafeERC20 for IERC20;

    uint256 private constant BASIS_POINTS = 10_000;
    uint256 public immutable rewardMultiplier;

    IERC20 public immutable rewardToken;
    IReliquary public immutable reliquary;

    uint256 public immutable depositBonus;
    uint256 public immutable minimum;
    uint256 public immutable cadence;

    /// @notice Mapping from relicId to timestamp of last deposit
    mapping(uint256 => uint256) public lastDepositTime;

    modifier onlyReliquary() {
        require(msg.sender == address(reliquary), "Only Reliquary can call this function.");
        _;
    }

    /// @notice Contructor called on deployment of this contract
    /// @param _rewardMultiplier Amount to multiply reward by, relative to BASIS_POINTS
    /// @param _depositBonus Bonus owed when cadence has elapsed since lastDepositTime
    /// @param _minimum The minimum deposit amount to be eligible for depositBonus
    /// @param _cadence The minimum elapsed time since lastDepositTime
    /// @param _rewardToken Address of token rewards are distributed in
    /// @param _reliquary Address of Reliquary this rewarder will read state from
    constructor(
        uint256 _rewardMultiplier,
        uint256 _depositBonus,
        uint256 _minimum,
        uint256 _cadence,
        IERC20 _rewardToken,
        IReliquary _reliquary
    ) {
        require(_minimum != 0, "no minimum set!");
        require(_cadence >= 1 days, "please set a reasonable cadence");
        rewardMultiplier = _rewardMultiplier;
        depositBonus = _depositBonus;
        minimum = _minimum;
        cadence = _cadence;
        rewardToken = _rewardToken;
        reliquary = _reliquary;
    }

    /// @notice Called by Reliquary harvest or withdrawAndHarvest function
    /// @param relicId The NFT ID of the position
    /// @param rewardAmount Amount of reward token owed for this position from the Reliquary
    function onReward(uint256 relicId, uint256 rewardAmount) external onlyReliquary {
        if (rewardMultiplier != 0) {
            uint256 pendingReward = (rewardAmount * rewardMultiplier) / BASIS_POINTS;
            rewardToken.safeTransfer(reliquary.ownerOf(relicId), pendingReward);
        }
    }

    /// @notice Called by Reliquary _deposit function
    /// @param relicId The NFT ID of the position
    /// @param depositAmount Amount being deposited into the underlying Reliquary position
    function onDeposit(uint256 relicId, uint256 depositAmount) external onlyReliquary {
        if (depositAmount >= minimum) {
            uint256 _lastDepositTime = lastDepositTime[relicId];
            uint256 timestamp = block.timestamp;
            lastDepositTime[relicId] = timestamp;
            _claimDepositBonus(reliquary.ownerOf(relicId), timestamp, _lastDepositTime);
        }
    }

    /// @notice Called by Reliquary withdraw or withdrawAndHarvest function
    /// @param relicId The NFT ID of the position
    /// @param withdrawalAmount Amount being withdrawn from the underlying Reliquary position
    function onWithdraw(uint256 relicId, uint256 withdrawalAmount) external onlyReliquary {
        uint256 _lastDepositTime = lastDepositTime[relicId];
        delete lastDepositTime[relicId];
        _claimDepositBonus(reliquary.ownerOf(relicId), block.timestamp, _lastDepositTime);
    }

    /// @notice Claim depositBonus without making another deposit
    /// @param relicId The NFT ID of the position
    function claimDepositBonus(uint256 relicId) external {
        address to = msg.sender;
        require(to == reliquary.ownerOf(relicId), "you do not own this Relic");
        uint256 _lastDepositTime = lastDepositTime[relicId];
        delete lastDepositTime[relicId];
        require(_claimDepositBonus(to, block.timestamp, _lastDepositTime), "nothing to claim");
    }

    /// @dev Internal claimDepositBonus function
    /// @param to Address to send the depositBonus to
    /// @param timestamp The current timestamp, passed in for gas efficiency
    /// @param _lastDepositTime Time of last deposit into this position, before being updated
    /// @return claimed Whether depositBonus was actually claimed
    function _claimDepositBonus(
        address to,
        uint256 timestamp,
        uint256 _lastDepositTime
    ) internal returns (bool claimed) {
        if (_lastDepositTime != 0 && timestamp - _lastDepositTime >= cadence) {
            rewardToken.safeTransfer(to, depositBonus);
            claimed = true;
        } else {
            claimed = false;
        }
    }

    /// @notice Returns the amount of pending tokens for a position from this rewarder
    ///         Interface supports multiple tokens
    /// @param relicId The NFT ID of the position
    /// @param rewardAmount Amount of reward token owed for this position from the Reliquary
    function pendingTokens(uint256 relicId, uint256 rewardAmount)
        external
        view
        returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts)
    {
        rewardTokens = new IERC20[](1);
        rewardTokens[0] = rewardToken;

        uint256 reward = (rewardAmount * rewardMultiplier) / BASIS_POINTS;
        uint256 _lastDepositTime = lastDepositTime[relicId];
        if (_lastDepositTime != 0 && block.timestamp - _lastDepositTime >= cadence) {
            reward += depositBonus;
        }
        rewardAmounts = new uint256[](1);
        rewardAmounts[0] = reward;
    }
}
