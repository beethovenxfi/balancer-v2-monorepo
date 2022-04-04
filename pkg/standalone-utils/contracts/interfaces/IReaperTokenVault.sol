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

import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol";

interface IReaperTokenVault is IERC20 {
    /**
     * @dev returns the address of the vault's underlying asset (mainToken)
     */
    function token() external view returns (address);
    
    /**
     * @notice Deposits `_amount` `token`, issuing shares to the caller. 
     * If Panic is activated, deposits will not be accepted and this call will fail.
     * @param _amount The quantity of tokens to deposit.
     **/
    function deposit(uint256 _amount) external;

    /**
     * @notice Withdraws the calling account's tokens from this Vault, 
     * redeeming amount `_shares` for an appropriate amount of tokens.
     **/
    function withdraw(uint256 _shares) external;
}
