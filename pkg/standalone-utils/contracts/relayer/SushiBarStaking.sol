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

import "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/Address.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/liquidity-mining/ISushiBar.sol";

import "./IBaseRelayerLibrary.sol";

/**
 * @title SushiBarStaking
 * @notice Allows users to deposit and withdraw tokens to/from a SushiBar contract
 * @dev All functions must be payable so that it can be called as part of a multicall involving ETH
 */
abstract contract SushiBarStaking is IBaseRelayerLibrary {
    using Address for address payable;

    function sushiBarEnter(
        ISushiBar sushiBar,
        IERC20 token,
        address sender,
        address recipient,
        uint256 amount,
        uint256 outputReference
    ) internal {
        if (_isChainedReference(amount)) {
            amount = _getChainedReferenceValue(amount);
        }

        //We should be verifying that the token passed in is in fact the correct token for the sushi bar,
        //but xBOO, xTAROT and fBEETS all implement the underlying token with different variables names
        //(xBOO.boo / xTAROT.underlying / fBEETS.vestingToken). Either we implement an extension for each,
        //or we forgo the require check, as both enter and leave are the same interface across all 3.

        // The deposit caller is the implicit sender of tokens, so if the goal is for the tokens
        // to be sourced from outside the relayer, we must first pull them here.
        if (sender != address(this)) {
            require(sender == msg.sender, "Incorrect sender");
            _pullToken(sender, token, amount);
        }

        //determine the amount of xSUSHI that is present on the batch relayer prior to entering
        //this should always be 0, but we want to be certain
        uint256 xSushiAmountBefore = sushiBar.balanceOf(address(this));

        //deposit the vesting token into the sushi bar
        token.approve(address(sushiBar), amount);
        sushiBar.enter(amount);

        //determine the amount of xSUSHI minted for the amount deposited
        uint256 xSushiAmount = sushiBar.balanceOf(address(this)) - xSushiAmountBefore;

        //transfer the xSUSHI to the recipient
        sushiBar.transfer(recipient, xSushiAmount);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, xSushiAmount);
        }
    }

    function sushiBarLeave(
        ISushiBar sushiBar,
        IERC20 token,
        address sender,
        address recipient,
        uint256 amount,
        uint256 outputReference
    ) internal {
        if (_isChainedReference(amount)) {
            amount = _getChainedReferenceValue(amount);
        }

        // The deposit caller is the implicit sender of tokens, so if the goal is for the tokens
        // to be sourced from outside the relayer, we must first pull them here.
        if (sender != address(this)) {
            require(sender == msg.sender, "Incorrect sender");
            _pullToken(sender, sushiBar, amount);
        }

        //determine the amount of SUSHI that is present on the batch relayer prior to leaving.
        //This should always be 0, but we want to be certain
        uint256 sushiAmountBefore = token.balanceOf(address(this));

        //burn the xSUSHI shares and receive SUSHI
        sushiBar.leave(amount);

        //determine the amount of SUSHI returned for the shares burned
        uint256 sushiAmount = token.balanceOf(address(this)) - sushiAmountBefore;

        //send the SUSHI to the recipient
        token.transfer(recipient, sushiAmount);

        if (_isChainedReference(outputReference)) {
            _setChainedReferenceValue(outputReference, sushiAmount);
        }
    }
}
