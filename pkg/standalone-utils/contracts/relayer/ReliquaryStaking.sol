// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/Address.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/liquidity-mining/IReliquary.sol";
import "@balancer-labs/v2-interfaces/contracts/liquidity-mining/IReliquaryRewarder.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/SafeERC20.sol";
import "./IBaseRelayerLibrary.sol";

/**
 * @title ReliquaryStaking
 * @notice Allows users to deposit and withdraw BPT to/from relic
 * @dev All functions must be payable so that it can be called as part of a multicall involving ETH
 */
abstract contract ReliquaryStaking is IBaseRelayerLibrary {
    using Address for address payable;
    using SafeERC20 for IERC20;

    IReliquary private immutable _reliquary;

    constructor(IReliquary reliquary) {
        _reliquary = reliquary;
    }

    function reliquaryCreateRelicAndDeposit(
        address sender,
        address recipient,
        IERC20 token,
        uint256 poolId,
        uint256 amount,
        uint256 outputReference
    ) external payable {
        if (_isChainedReference(amount)) {
            amount = _getChainedReferenceValue(amount);
        }
        require(_reliquary.poolToken(poolId) == token, "Incorrect token provided");

        // The deposit caller is the implicit sender of tokens, so if the goal is for the tokens
        // to be sourced from outside the relayer, we must first pull them here.
        if (sender != address(this)) {
            require(sender == msg.sender, "Incorrect sender");
            _pullToken(sender, token, amount);
        }

        // deposit the tokens to the masterchef
        token.approve(address(_reliquary), amount);
        _reliquary.createRelicAndDeposit(recipient, poolId, amount);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, amount);
        }
    }

    function reliquaryDeposit(
        address sender,
        IERC20 token,
        uint256 relicId,
        uint256 amount,
        uint256 outputReference
    ) external payable {
        if (_isChainedReference(amount)) {
            amount = _getChainedReferenceValue(amount);
        }
        PositionInfo memory position = _reliquary.getPositionForId(relicId);
        require(_reliquary.poolToken(position.poolId) == token, "Incorrect token provided");

        // The deposit caller is the implicit sender of tokens, so if the goal is for the tokens
        // to be sourced from outside the relayer, we must first pull them here.
        if (sender != address(this)) {
            require(sender == msg.sender, "Incorrect sender");
            _pullToken(sender, token, amount);
        }

        // deposit the tokens to the masterchef
        token.approve(address(_reliquary), amount);
        _reliquary.deposit(relicId, amount);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, amount);
        }
    }

    function reliquaryWithdraw(
        address recipient,
        uint256 relicId,
        uint256 amount,
        uint256 outputReference
    ) external payable {
        if (_isChainedReference(amount)) {
            amount = _getChainedReferenceValue(amount);
        }
        IERC20 rewardToken = _reliquary.rewardToken();
        PositionInfo memory position = _reliquary.getPositionForId(relicId);
        IERC20 poolToken = _reliquary.poolToken(position.poolId);

        // withdraw the token from the masterchef, sending it to the recipient
        _reliquary.withdrawAndHarvest(amount, relicId);
        // we transfer the base emission rewards
        rewardToken.transfer(recipient, rewardToken.balanceOf(address(this)));
        // now we have to check if we got additional rewards
        IRewarder rewarder = _reliquary.rewarder(position.poolId);
        if (address(rewarder) != address(0)) {
            IERC20 additionalRewardToken = IRewarder(rewarder).rewardToken();
            additionalRewardToken.transfer(recipient, additionalRewardToken.balanceOf(address(this)));
        }
        // now we transfer the staked token
        poolToken.transfer(recipient, amount);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, amount);
        }
    }

    function harvestAll(address recipient) external payable {
        uint256 balance = _reliquary.balanceOf(msg.sender);
        if (balance == 0) {
            return;
        }
        IERC20 rewardToken = _reliquary.rewardToken();
        for (uint256 i = 0; i < balance; i++) {
            uint256 relicId = _reliquary.tokenOfOwnerByIndex(msg.sender, i);
            PositionInfo memory position = _reliquary.getPositionForId(relicId);
            // we harvest the base emissions
            _reliquary.harvest(relicId);
            // now we have to check if we got additional rewards
            // since each rewarder can have a different reward token, we transfer them right away
            IRewarder rewarder = _reliquary.rewarder(position.poolId);
            if (address(rewarder) != address(0)) {
                IERC20 additionalRewardToken = IRewarder(rewarder).rewardToken();
                additionalRewardToken.transfer(recipient, additionalRewardToken.balanceOf(address(this)));
            }
        }
        rewardToken.transfer(recipient, rewardToken.balanceOf(address(this)));
    }
}
