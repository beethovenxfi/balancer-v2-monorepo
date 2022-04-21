import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import { ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import { BigNumberish, bn, fp } from '@balancer-labs/v2-helpers/src/numbers';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import { Account } from '@balancer-labs/v2-helpers/src/models/types/types';
import TypesConverter from '@balancer-labs/v2-helpers/src/models/types/TypesConverter';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';
import { Address } from 'cluster';

const INITIAL_AMOUNT = fp(100);

describe('FBeetsBarStaking', function () {
  let beets: Token, otherToken: Token;
  let fbeets: Contract;
  let senderUser: SignerWithAddress, recipientUser: SignerWithAddress, admin: SignerWithAddress;
  let vault: Vault;
  let relayer: Contract, relayerLibrary: Contract;

  before('setup signer', async () => {
    [, admin, senderUser, recipientUser] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy Vault and MasterChef', async () => {
    vault = await Vault.create({ admin });
    beets = await Token.create('BEETS');
    otherToken = await Token.create('OTHER');

    fbeets = await deploy('MockFBeetsBar', {
      args: [admin.address, beets.address],
    });
  });

  sharedBeforeEach('mint tokens to senderUser', async () => {
    await beets.mint(senderUser, INITIAL_AMOUNT);
    await beets.approve(vault.address, INITIAL_AMOUNT, { from: senderUser });

    await otherToken.mint(senderUser, INITIAL_AMOUNT);
    await otherToken.approve(vault.address, INITIAL_AMOUNT, { from: senderUser });

    await fbeets.connect(senderUser).approve(vault.address, INITIAL_AMOUNT);
  });

  sharedBeforeEach('set up relayer', async () => {
    // Deploy Relayer
    relayerLibrary = await deploy('MockBatchRelayerLibrary', {
      args: [vault.address, ZERO_ADDRESS, ZERO_ADDRESS, fbeets.address, ZERO_ADDRESS, ZERO_ADDRESS],
    });
    relayer = await deployedAt('BalancerRelayer', await relayerLibrary.getEntrypoint());

    // Authorize Relayer for all actions
    const relayerActionIds = await Promise.all(
      ['swap', 'batchSwap', 'joinPool', 'exitPool', 'setRelayerApproval', 'manageUserBalance'].map((action) =>
        actionId(vault.instance, action)
      )
    );
    const authorizer = await deployedAt('v2-vault/Authorizer', await vault.instance.getAuthorizer());
    await authorizer.connect(admin).grantRolesGlobally(relayerActionIds, relayer.address);

    // Approve relayer by sender
    await vault.instance.connect(senderUser).setRelayerApproval(senderUser.address, relayer.address, true);
  });

  const CHAINED_REFERENCE_PREFIX = 'ba10';
  function toChainedReference(key: BigNumberish): BigNumber {
    // The full padded prefix is 66 characters long, with 64 hex characters and the 0x prefix.
    const paddedPrefix = `0x${CHAINED_REFERENCE_PREFIX}${'0'.repeat(64 - CHAINED_REFERENCE_PREFIX.length)}`;

    return BigNumber.from(paddedPrefix).add(key);
  }

  function encodeEnter(
    sender: Account,
    recipient: Account,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('fBeetsBarEnter', [
      TypesConverter.toAddress(sender),
      TypesConverter.toAddress(recipient),
      amount,
      outputReference ?? 0,
    ]);
  }

  function encodeLeave(
    sender: Account,
    recipient: Account,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('fBeetsBarLeave', [
      TypesConverter.toAddress(sender),
      TypesConverter.toAddress(recipient),
      amount,
      outputReference ?? 0,
    ]);
  }

  async function setChainedReferenceContents(ref: BigNumberish, value: BigNumberish): Promise<void> {
    await relayer.multicall([relayerLibrary.interface.encodeFunctionData('setChainedReferenceValue', [ref, value])]);
  }

  async function expectChainedReferenceContents(ref: BigNumberish, expectedValue: BigNumberish): Promise<void> {
    const receipt = await (
      await relayer.multicall([relayerLibrary.interface.encodeFunctionData('getChainedReferenceValue', [ref])])
    ).wait();

    expectEvent.inIndirectReceipt(receipt, relayerLibrary.interface, 'ChainedReferenceValueRead', {
      value: bn(expectedValue),
    });
  }

  describe('enter', () => {
    const amount = fp(1);

    it('can enter the sushibar', async () => {
      await relayer
        .connect(senderUser)
        .multicall([encodeEnter(senderUser, recipientUser, amount, toChainedReference(0))]);

      await expectChainedReferenceContents(toChainedReference(0), amount);

      const senderBeetsBalance = await beets.balanceOf(senderUser);
      expect(senderBeetsBalance.toString()).to.equal(INITIAL_AMOUNT.sub(amount).toString());
      const recipientFBeetsBalance = await fbeets.balanceOf(recipientUser.address);
      expect(recipientFBeetsBalance.toString()).to.equal(fp(1).toString());

      const fbeetsBeetsBalance = await beets.balanceOf(fbeets.address);
      expect(fbeetsBeetsBalance.toString()).to.equal(amount.toString());
    });

    it('only sends the amount of fBEETS minted on enter', async () => {
      await relayer.connect(senderUser).multicall([encodeEnter(senderUser, recipientUser, fp(50))]);

      //send 50 fbeets to the relayer
      await fbeets.connect(recipientUser).transfer(relayer.address, fp(50));
      const relayerFBeetsBalance = await fbeets.balanceOf(relayer.address);
      expect(relayerFBeetsBalance.toString()).to.equal(fp(50).toString());

      await relayer.connect(senderUser).multicall([encodeEnter(senderUser, senderUser, amount, toChainedReference(0))]);

      await expectChainedReferenceContents(toChainedReference(0), amount);

      const senderFBeetsBalance = await fbeets.balanceOf(senderUser.address);
      expect(senderFBeetsBalance.toString()).to.equal(fp(1).toString());
    });

    it('retrieves the correct chained reference amount and deposits that amount of tokens to the sushibar', async () => {
      const ref = toChainedReference(0);
      await setChainedReferenceContents(ref, amount);

      await relayer.connect(senderUser).multicall([encodeEnter(senderUser, recipientUser, ref, toChainedReference(1))]);

      await expectChainedReferenceContents(toChainedReference(1), amount);

      const senderBeetsBalance = await beets.balanceOf(senderUser);
      expect(senderBeetsBalance.toString()).to.equal(INITIAL_AMOUNT.sub(amount).toString());

      const recipientFBeetsBalance = await fbeets.balanceOf(recipientUser.address);
      expect(recipientFBeetsBalance.toString()).to.equal(fp(1).toString());

      const fbeetsBeetsBalance = await beets.balanceOf(fbeets.address);
      expect(fbeetsBeetsBalance.toString()).to.equal(amount.toString());
    });

    it('reverts when provided a token that is not the underlying token', async () => {
      const calls = [encodeEnter(senderUser, recipientUser, fp(1))];

      try {
        await relayer.connect(senderUser).multicall(calls);
        expect(true).to.equal(false);
      } catch (e) {
        //
      }
    });
  });

  describe('leave', () => {
    const amount = fp(1);

    it('can leave the sushibar', async () => {
      await relayer.connect(senderUser).multicall([encodeEnter(senderUser, senderUser, amount)]);

      await relayer
        .connect(senderUser)
        .multicall([encodeLeave(senderUser, recipientUser, amount, toChainedReference(0))]);

      const recipientBeetsBalance = await beets.balanceOf(recipientUser);
      expect(recipientBeetsBalance.toString()).to.equal(amount.toString());
    });

    it('only returns the beets received by burning fbeets when leaving the sushi bar', async () => {
      await beets.mint(relayer, fp(100));

      await relayer.connect(senderUser).multicall([encodeEnter(senderUser, senderUser, amount)]);

      await relayer
        .connect(senderUser)
        .multicall([encodeLeave(senderUser, recipientUser, amount, toChainedReference(0))]);

      const recipientBeetsBalance = await beets.balanceOf(recipientUser);
      expect(recipientBeetsBalance.toString()).to.equal(amount.toString());
    });

    it('retrieves the correct chained reference amount and burns that amount of fbeets by leaving the sushibar', async () => {
      const amountDeposited = fp(10);
      await relayer.connect(senderUser).multicall([encodeEnter(senderUser, senderUser, amountDeposited)]);

      const ref = toChainedReference(0);
      await setChainedReferenceContents(ref, amount);

      await relayer.connect(senderUser).multicall([encodeLeave(senderUser, recipientUser, ref, toChainedReference(1))]);

      await expectChainedReferenceContents(toChainedReference(1), amount);

      const recipientBeetsBalance = await beets.balanceOf(recipientUser);
      expect(recipientBeetsBalance.toString()).to.equal(amount.toString());
    });
  });
});
