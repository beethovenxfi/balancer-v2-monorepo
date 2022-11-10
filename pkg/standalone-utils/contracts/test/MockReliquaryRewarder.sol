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

    modifier onlyReliquary() {
        require(msg.sender == address(reliquary), "Only Reliquary can call this function.");
        _;
    }

    /// @notice Contructor called on deployment of this contract
    /// @param _rewardMultiplier Amount to multiply reward by, relative to BASIS_POINTS
    /// @param _rewardToken Address of token rewards are distributed in
    /// @param _reliquary Address of Reliquary this rewarder will read state from
    constructor(
        uint256 _rewardMultiplier,
        IERC20 _rewardToken,
        IReliquary _reliquary
    ) {
        rewardMultiplier = _rewardMultiplier;
        rewardToken = _rewardToken;
        reliquary = _reliquary;
    }

    /// @notice Called by Reliquary harvest or withdrawAndHarvest function
    /// @param relicId The NFT ID of the position
    /// @param rewardAmount Amount of reward token owed for this position from the Reliquary
    /// @param to Address to send rewards to
    function onReward(
        uint256 relicId,
        uint256 rewardAmount,
        address to
    ) external onlyReliquary {
        if (rewardMultiplier != 0) {
            uint256 pendingReward = (rewardAmount * rewardMultiplier) / BASIS_POINTS;
            rewardToken.safeTransfer(to, pendingReward);
        }
    }

    /// @notice Called by Reliquary _deposit function
    /// @param relicId The NFT ID of the position
    /// @param depositAmount Amount being deposited into the underlying Reliquary position
    function onDeposit(uint256 relicId, uint256 depositAmount) external virtual onlyReliquary {}

    /// @notice Called by Reliquary withdraw or withdrawAndHarvest function
    /// @param relicId The NFT ID of the position
    /// @param withdrawalAmount Amount being withdrawn from the underlying Reliquary position
    function onWithdraw(uint256 relicId, uint256 withdrawalAmount) external virtual onlyReliquary {}

    /// @notice Returns the amount of pending tokens for a position from this rewarder
    ///         Interface supports multiple tokens
    /// @param relicId The NFT ID of the position
    /// @param rewardAmount Amount of reward token owed for this position from the Reliquary
    function pendingTokens(uint256 relicId, uint256 rewardAmount)
        external
        view
        virtual
        returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts)
    {
        rewardTokens = new IERC20[](1);
        rewardTokens[0] = rewardToken;

        uint256 reward = (rewardAmount * rewardMultiplier) / BASIS_POINTS;
        rewardAmounts = new uint256[](1);
        rewardAmounts[0] = reward;
    }
}
