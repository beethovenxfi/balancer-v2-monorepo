import { fp } from '@balancer-labs/v2-helpers/src/numbers';
import { BigNumber } from 'ethers';
import { optimismTokens } from '../optimismTokens';
import { createWeightedPool } from '../../../src/createWeightedPool';
import { toNormalizedWeights } from '@balancer-labs/balancer-js/src';

export default async function (etherscanApiKey: string): Promise<void> {
  await createWeightedPool({
    name: 'Test pool',
    symbol: 'TEST-WEIGHTED',
    //the tokens here must be sorted by address. if you get an error code 101, your tokens are not sorted in the correct order
    tokens: [optimismTokens.WETH.address, optimismTokens.WBTC.address, optimismTokens.USDC.address],
    weights: toNormalizedWeights([fp(33.333333333333333333), fp(33.333333333333333333), fp(33.333333333333333333)]),
    initialBalances: [fp(0.00051), BigNumber.from(0.000034e8), BigNumber.from(10e6)],
    swapFeePercentage: fp(0.0025),
    etherscanApiKey,
  });
}
