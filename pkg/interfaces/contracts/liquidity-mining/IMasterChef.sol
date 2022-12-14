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

interface IMasterChef {
    /// @notice Address of the LP token for each MCV pool.
    function lpTokens(uint256 idx) external view returns (IERC20);

    /**
     * @notice Deposit LP tokens to MasterChef for reward allocation.
     * @param _pid The index of the pool. See `poolInfo`.
     * @param _amount LP token amount to deposit.
     * @param _to Address to deposit the tokens on behalf of.
     **/
    function deposit(
        uint256 _pid,
        uint256 _amount,
        address _to
    ) external;

    /**
     * @notice Withdraw LP tokens from MasterChef and harvest proceeds for transaction sender to `_to`.
     * @param _pid The index of the pool. See `poolInfo`.
     * @param _amount LP token amount to withdraw.
     * @param _to Receiver of the LP tokens and BEETS rewards.
     **/
    function withdrawAndHarvest(
        uint256 _pid,
        uint256 _amount,
        address _to
    ) external;
}
