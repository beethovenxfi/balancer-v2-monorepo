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
        require(_reliquary.poolToken(poolId) == address(token), "Incorrect token for pid");

        // The deposit caller is the implicit sender of tokens, so if the goal is for the tokens
        // to be sourced from outside the relayer, we must first pull them here.
        if (sender != address(this)) {
            require(sender == msg.sender, "Incorrect sender");
            _pullToken(sender, token, amount);
        }

        token.approve(address(_reliquary), amount);
        // mint a new relic and deposit the tokens
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
        require(_reliquary.poolToken(position.poolId) == address(token), "Incorrect token for pid");

        // The deposit caller is the implicit sender of tokens, so if the goal is for the tokens
        // to be sourced from outside the relayer, we must first pull them here.
        if (sender != address(this)) {
            require(sender == msg.sender, "Incorrect sender");
            _pullToken(sender, token, amount);
        }

        token.approve(address(_reliquary), amount);
        // deposit the tokens to an existing relic
        _reliquary.deposit(amount, relicId);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, amount);
        }
    }

    function reliquaryWithdrawAndHarvest(
        address recipient,
        uint256 relicId,
        uint256 amount,
        uint256 outputReference
    ) external payable {
        if (_isChainedReference(amount)) {
            amount = _getChainedReferenceValue(amount);
        }

        require(msg.sender == _reliquary.ownerOf(relicId), "Sender not owner of relic");
        PositionInfo memory position = _reliquary.getPositionForId(relicId);
        address poolTokenAddress = _reliquary.poolToken(position.poolId);
        IERC20 poolToken = IERC20(poolTokenAddress);

        _reliquary.withdrawAndHarvest(amount, relicId, recipient);
        poolToken.transfer(recipient, amount);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, amount);
        }
    }

    function reliquaryHarvestAll(uint256[] memory relicIds, address recipient) external payable {
        for (uint256 i = 0; i < relicIds.length; i++) {
            require(msg.sender == _reliquary.ownerOf(relicIds[i]), "Sender not owner of relic");
            _reliquary.harvest(relicIds[i], recipient);
        }
    }
}
