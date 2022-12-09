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

import "@balancer-labs/v2-interfaces/contracts/pool-linear/ITarotSupplyVault.sol";
import "@balancer-labs/v2-interfaces/contracts/pool-linear/ITarotBorrowable.sol";
import "@balancer-labs/v2-solidity-utils/contracts/math/Math.sol";

// solhint-disable not-rely-on-time

contract TarotShareValueHelper {
    using Math for uint256;

    ITarotSupplyVault private immutable _supplyVault;

    constructor(IERC20 wrappedToken) {
        _supplyVault = ITarotSupplyVault(address(wrappedToken));
    }

    function _sharesToAmount(uint256 shares) internal view returns (uint256) {
        IERC20 underlying = IERC20(_supplyVault.underlying());
        uint256 totalUnderlying = underlying.balanceOf(address(_supplyVault));
        uint256 borrowablesLength = _supplyVault.getBorrowablesLength();

        for (uint256 i = 0; i < borrowablesLength; i++) {
            ITarotBorrowable borrowable = ITarotBorrowable(
                _supplyVault.borrowables(i)
            );
            uint256 borrowableAmount = borrowable.balanceOf(
                address(_supplyVault)
            );
            if (borrowableAmount > 0) {
                uint256 exchangeRate = _borrowableExchangeRate(borrowable);
                totalUnderlying = totalUnderlying.add(
                    borrowableAmount.mul(exchangeRate).div(1E18, false)
                );
            }
        }

        return totalUnderlying.mul(shares).div(_supplyVault.totalSupply(), false);
    }

    function _borrowableExchangeRate(ITarotBorrowable borrowable) private view returns (uint256) {
        uint256 totalBorrows = borrowable.totalBorrows();
        {
            uint256 borrowRate = borrowable.borrowRate();
            uint32 accrualTimestamp = borrowable.accrualTimestamp();
            uint32 timeElapsed = uint32(block.timestamp % 2**32) -
                accrualTimestamp;
            uint256 interestFactor = borrowRate.mul(timeElapsed);
            uint256 interestAccumulated = interestFactor.mul(totalBorrows).div(
                1e18,
                false
            );
            totalBorrows = totalBorrows.add(interestAccumulated);
        }

        uint256 actualBalance;
        {
            uint256 totalBalance = borrowable.totalBalance();
            actualBalance = totalBalance.add(totalBorrows);
        }

        uint256 borrowableTotalSupply = borrowable.totalSupply();

        uint256 exchangeRate = actualBalance.mul(1E18).div(borrowableTotalSupply, false);
        uint256 exchangeRateLast = borrowable.exchangeRateLast();
        if (exchangeRate <= exchangeRateLast) {
            return exchangeRate;
        } else {
            uint256 reserveFactor = borrowable.reserveFactor();
            uint256 exchangeRateNew = exchangeRate.sub(
                exchangeRate.sub(exchangeRateLast).mul(reserveFactor).div(
                    1e18,
                    false
                )
            );
            uint256 liquidity = borrowableTotalSupply
                .mul(exchangeRate)
                .div(exchangeRateNew, false)
                .sub(borrowableTotalSupply);
            if (liquidity == 0) {
                return exchangeRate;
            }
            return exchangeRateNew;
        }
    }
}
