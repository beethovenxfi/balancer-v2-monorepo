// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";

interface IRewarder {
    function onReward(
        uint256 relicId,
        uint256 rewardAmount,
        address to
    ) external;

    function onDeposit(uint256 relicId, uint256 depositAmount) external;

    function onWithdraw(uint256 relicId, uint256 withdrawalAmount) external;

    function pendingTokens(uint256 relicId, uint256 rewardAmount)
        external
        view
        returns (IERC20[] memory, uint256[] memory);
}
