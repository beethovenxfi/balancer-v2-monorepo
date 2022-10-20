// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";

/*
 + @notice Info for each Reliquary position.
 + `amount` LP token amount the position owner has provided
 + `rewardDebt` Amount of reward token accumalated before the position's entry or last harvest
 + `rewardCredit` Amount of reward token owed to the user on next harvest
 + `entry` Used to determine the maturity of the position
 + `poolId` ID of the pool to which this position belongs
 + `level` Index of this position's level within the pool's array of levels
*/
struct PositionInfo {
    uint256 amount;
    uint256 rewardDebt;
    uint256 rewardCredit;
    uint256 entry; // position owner's relative entry into the pool.
    uint256 poolId; // ensures that a single Relic is only used for one pool.
    uint256 level;
}

/*
 + @notice Info of each Reliquary pool
 + `accRewardPerShare` Accumulated reward tokens per share of pool (1 / 1e12)
 + `lastRewardTime` Last timestamp the accumulated reward was updated
 + `allocPoint` Pool's individual allocation - ratio of the total allocation
 + `name` Name of pool to be displayed in NFT image
*/
struct PoolInfo {
    uint256 accRewardPerShare;
    uint256 lastRewardTime;
    uint256 allocPoint;
    string name;
}

/*
 + @notice Level that determines how maturity is rewarded
 + `requiredMaturity` The minimum maturity (in seconds) required to reach this Level
 + `allocPoint` Level's individual allocation - ratio of the total allocation
 + `balance` Total number of tokens deposited in positions at this Level
*/
struct LevelInfo {
    uint256[] requiredMaturity;
    uint256[] allocPoint;
    uint256[] balance;
}

interface IReliquary {
    function burn(uint256 tokenId) external;

    function createRelicAndDeposit(
        address to,
        uint256 pid,
        uint256 amount
    ) external returns (uint256 id);

    function deposit(uint256 amount, uint256 relicId) external;

    function withdraw(uint256 amount, uint256 relicId) external;

    function harvest(uint256 relicId) external;

    function withdrawAndHarvest(uint256 amount, uint256 relicId) external;

    function emergencyWithdraw(uint256 relicId) external;

    function poolToken(uint256 pid) external returns (IERC20);
}
