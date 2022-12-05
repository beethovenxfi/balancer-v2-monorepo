// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2015, 2016, 2017 Dapphub

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

import "@balancer-labs/v2-solidity-utils/contracts/math/FixedPoint.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "@balancer-labs/v2-solidity-utils/contracts/test/TestToken.sol";
import "@balancer-labs/v2-interfaces/contracts/liquidity-mining/IFBeetsBar.sol";

contract MockFBeetsBar is TestToken, IFBeetsBar {
    IERC20 public override vestingToken;

    constructor(IERC20 _vestingToken) TestToken("FBeetsBar", "fBEETS", 18) {
        vestingToken = _vestingToken;
    }

    function enter(uint256 _amount) external override {
        if (_amount > 0) {
            uint256 totalLockedTokenSupply = vestingToken.balanceOf(address(this));
            uint256 totalFreshBeets = totalSupply();

            vestingToken.transferFrom(msg.sender, address(this), _amount);

            uint256 mintAmount;
            // If no fBeets exists, mint it 1:1 to the amount put in
            if (totalFreshBeets == 0 || totalLockedTokenSupply == 0) {
                mintAmount = _amount;
            }
            // Calculate and mint the amount of fBeets the blp is worth. The ratio will change overtime
            else {
                uint256 shareOfFreshBeets = (_amount * totalFreshBeets) / totalLockedTokenSupply;

                mintAmount = shareOfFreshBeets;
            }
            _mint(msg.sender, mintAmount);
        }
    }

    function leave(uint256 _share) external override {
        if (_share > 0) {
            uint256 totalVestedTokenSupply = vestingToken.balanceOf(address(this));

            uint256 totalFreshBeets = totalSupply();
            // Calculates the amount of vestingToken the fBeets are worth
            uint256 amount = (_share * totalVestedTokenSupply) / totalFreshBeets;

            _burn(msg.sender, _share);

            vestingToken.transfer(msg.sender, amount);
        }
    }
}
