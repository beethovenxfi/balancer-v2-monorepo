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

import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";

interface ISushiBar is IERC20 {
    /**
     * @notice Deposit tokens to the SushiBar and receive xSUSHI tokens in return.
     * @param _amount token amount to deposit.
     **/
    function enter(uint256 _amount) external;

    /**
     * @notice Withdraw LP tokens from MasterChef and harvest proceeds for transaction sender to `_to`.
     * @param _share The amount of x tokens to burn
     **/
    function leave(uint256 _share) external;
}
