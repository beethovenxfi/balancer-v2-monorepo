import { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { bn, fp } from '@balancer-labs/v2-helpers/src/numbers';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';

import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import LinearPool from '@balancer-labs/v2-helpers/src/models/pools/linear/LinearPool';

import { deploy } from '@balancer-labs/v2-helpers/src/contract';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';

describe('TarotLinearPool', function () {
  let pool: LinearPool, tokens: TokenList, mainToken: Token, wrappedToken: Token;
  let poolFactory: Contract;
  let trader: SignerWithAddress, lp: SignerWithAddress, owner: SignerWithAddress;
  let mockTarotSupplyVault: Contract;

  const POOL_SWAP_FEE_PERCENTAGE = fp(0.01);

  before('setup', async () => {
    [, lp, trader, owner] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy tokens', async () => {
    const [deployer] = await ethers.getSigners();
    mainToken = await Token.create('FTM');
    mockTarotSupplyVault = await deploy('MockTarotSupplyVault', {
      args: ['TarotSupplyVault', 'tFTM', 18, mainToken.address],
    });
    wrappedToken = await Token.deployedAt(mockTarotSupplyVault.address);
    tokens = new TokenList([mainToken, wrappedToken]).sort();

    //initialize at a rate of 1
    await mainToken.mint(wrappedToken.address, fp(100));
    await wrappedToken.mint(lp, fp(100));
  });

  sharedBeforeEach('deploy pool factory', async () => {
    const vault = await Vault.create();
    const queries = await deploy('v2-standalone-utils/BalancerQueries', { args: [vault.address] });

    poolFactory = await deploy('TarotLinearPoolFactory', {
      args: [vault.address, vault.getFeesProvider().address, queries.address, '1.0', '1.0'],
    });
  });

  describe('getWrappedTokenRate', () => {
    sharedBeforeEach('deploy and initialize pool', async () => {
      const tx = await poolFactory.create(
        'Beets Boosted FTM',
        'bb-FTM',
        mainToken.address,
        wrappedToken.address,
        bn(0),
        POOL_SWAP_FEE_PERCENTAGE,
        owner.address
      );

      const receipt = await tx.wait();
      const event = expectEvent.inReceipt(receipt, 'PoolCreated');
      pool = await LinearPool.deployedAt(event.args.pool);
    });

    it('returns the expected wrapped token rate', async () => {
      await mainToken.mint(wrappedToken.address, fp(100));

      expect(await pool.getWrappedTokenRate()).to.be.eq(fp(2));
    });

    it('minting main tokens to a random address should have no impact on the rate', async () => {
      await mainToken.mint(trader, fp(100));
      expect(await pool.getWrappedTokenRate()).to.be.eq(fp(1));
    });

    it('should handle decimal wrapped token rates', async () => {
      await mainToken.mint(wrappedToken.address, fp(2));

      expect(await pool.getWrappedTokenRate()).to.be.eq(fp(102 / 100));
    });

    it('should handle 18 points of precision', async () => {
      //1.111_111_111_111_111_111
      await mainToken.mint(wrappedToken.address, '1111111111111111111');

      //1.011_111_111_111_111_111
      expect((await pool.getWrappedTokenRate()).toString()).to.be.eq('1011111111111111111');
    });

    it('should always return the latest wrapped token rate', async () => {
      await mainToken.mint(wrappedToken.address, fp(2));
      expect(await pool.getWrappedTokenRate()).to.be.eq(fp(102 / 100));
      await mainToken.mint(wrappedToken.address, fp(2));
      expect(await pool.getWrappedTokenRate()).to.be.eq(fp(104 / 100));
      await mainToken.mint(wrappedToken.address, fp(2));
      expect(await pool.getWrappedTokenRate()).to.be.eq(fp(106 / 100));
    });

    it('should fail to deploy a pool when deployed with an incorrect main token', async () => {
      const otherMainToken = await Token.create('OTHER');

      try {
        const tx = await poolFactory.create(
          'Balancer Pool Token',
          'BPT',
          otherMainToken.address,
          wrappedToken.address,
          bn(0),
          POOL_SWAP_FEE_PERCENTAGE,
          owner.address
        );

        const receipt = await tx.wait();
        expect(true).to.be.eq(false);
      } catch {
        //
      }
    });
  });
});
