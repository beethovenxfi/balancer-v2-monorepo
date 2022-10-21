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
import "./IBaseRelayerLibrary.sol";

/**
 * @title ReliquaryStaking
 * @notice Allows users to deposit and withdraw BPT to/from relic
 * @dev All functions must be payable so that it can be called as part of a multicall involving ETH
 */
abstract contract ReliquaryStaking is IBaseRelayerLibrary {
    using Address for address payable;

    IReliquary private immutable _reliquary;
    IERC20 private immutable _rewardToken;

    constructor(IReliquary reliquary) {
        _reliquary = reliquary;

        IERC20 rewardToken = IERC20(address(0));
        if (address(reliquary) != address(0)) {
            rewardToken = reliquary.rewardToken();
        }
        _rewardToken = rewardToken;
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
        PositionInfo memory position = _reliquary.getPositionForId(relicId);
        IERC20 token = _reliquary.poolToken(position.poolId);

        // withdraw the token from the masterchef, sending it to the recipient
        _reliquary.withdrawAndHarvest(amount, relicId);
        // we transfer the rewards
        _rewardToken.transfer(recipient, _rewardToken.balanceOf(address(this)));
        // now we transfer the staked token
        token.transfer(recipient, amount);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, amount);
        }
    }
}
