# 2023-04-24 - Midas Linear Pool

First deployment of the `MidasLinearPoolFactory`, for Linear Pools with a Midas yield-bearing token.
Already fixes the reentrancy issue described in https://forum.balancer.fi/t/reentrancy-vulnerability-scope-expanded/4345.
Also has a fix in the `MidasLinearPoolRebalancer` to handle tokens which require the `SafeERC20` library for approvals.

## Useful Files
