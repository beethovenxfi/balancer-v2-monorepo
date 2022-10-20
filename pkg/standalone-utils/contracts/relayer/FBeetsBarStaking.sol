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
import "@balancer-labs/v2-interfaces/contracts/liquidity-mining/IFBeetsBar.sol";
import "./SushiBarStaking.sol";

/**
 * @title BooMirrorWorldStaking
 * @notice Allows users to deposit and withdraw tokens to/from the BooMirrorWorld contract
 * @dev All functions must be payable so that it can be called as part of a multicall involving ETH
 */
abstract contract FBeetsBarStaking is SushiBarStaking {
    using Address for address payable;

    IFBeetsBar private immutable _fBeetsBar;

    constructor(IFBeetsBar fBeetsBar) {
        _fBeetsBar = fBeetsBar;
    }

    function fBeetsBarEnter(
        address sender,
        address recipient,
        uint256 amount,
        uint256 outputReference
    ) external payable {
        sushiBarEnter(_fBeetsBar, _fBeetsBar.vestingToken(), sender, recipient, amount, outputReference);
    }

    function fBeetsBarLeave(
        address sender,
        address recipient,
        uint256 amount,
        uint256 outputReference
    ) external payable {
        sushiBarLeave(_fBeetsBar, _fBeetsBar.vestingToken(), sender, recipient, amount, outputReference);
    }
}
