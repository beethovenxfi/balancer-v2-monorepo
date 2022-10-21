import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import { ANY_ADDRESS, ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import { BigNumberish, bn, fp } from '@balancer-labs/v2-helpers/src/numbers';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import { Account } from '@balancer-labs/v2-helpers/src/models/types/types';
import TypesConverter from '@balancer-labs/v2-helpers/src/models/types/TypesConverter';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';
import { toChainedReference } from './helpers/chainedReferences';

const INITIAL_AMOUNT = fp(100);

describe('MasterChefStaking', function () {
  let bpt1: Token, bpt2: Token, otherToken: Token;
  let masterChefContract: Contract;
  let senderUser: SignerWithAddress, recipientUser: SignerWithAddress, admin: SignerWithAddress;
  let vault: Vault;
  let relayer: Contract, relayerLibrary: Contract;

  before('setup signer', async () => {
    [, admin, senderUser, recipientUser] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy Vault and MasterChef', async () => {
    vault = await Vault.create({ admin });
    bpt1 = await Token.create('BPT-1');
    bpt2 = await Token.create('BPT-2');
    otherToken = await Token.create('OTHER');

    masterChefContract = await deploy('MockMasterChef', { args: [[bpt1.address, bpt2.address]] });
  });

  sharedBeforeEach('mint tokens to senderUser', async () => {
    await bpt1.mint(senderUser, INITIAL_AMOUNT);
    await bpt1.approve(vault.address, INITIAL_AMOUNT, { from: senderUser });

    await bpt2.mint(senderUser, INITIAL_AMOUNT);
    await bpt2.approve(vault.address, INITIAL_AMOUNT, { from: senderUser });

    await otherToken.mint(senderUser, INITIAL_AMOUNT);
    await otherToken.approve(vault.address, INITIAL_AMOUNT, { from: senderUser });
  });

  sharedBeforeEach('set up relayer', async () => {
    // Deploy Relayer
    relayerLibrary = await deploy('MockBatchRelayerLibrary', {
      args: [vault.address, ZERO_ADDRESS, ZERO_ADDRESS, masterChefContract.address, ZERO_ADDRESS, ZERO_ADDRESS],
    });

    relayer = await deployedAt('BalancerRelayer', await relayerLibrary.getEntrypoint());

    // Authorize Relayer for all actions
    const relayerActionIds = await Promise.all(
      ['swap', 'batchSwap', 'joinPool', 'exitPool', 'setRelayerApproval', 'manageUserBalance'].map((action) =>
        actionId(vault.instance, action)
      )
    );
    const authorizer = await deployedAt('v2-vault/TimelockAuthorizer', await vault.instance.getAuthorizer());
    const wheres = relayerActionIds.map(() => ANY_ADDRESS);
    await authorizer.connect(admin).grantPermissions(relayerActionIds, relayer.address, wheres);

    // Approve relayer by sender
    await vault.instance.connect(senderUser).setRelayerApproval(senderUser.address, relayer.address, true);
  });

  function encodeDeposit(
    sender: Account,
    recipient: Account,
    token: Token,
    pid: number,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('masterChefDeposit', [
      TypesConverter.toAddress(sender),
      TypesConverter.toAddress(recipient),
      TypesConverter.toAddress(token),
      pid,
      amount,
      outputReference ?? 0,
    ]);
  }

  function encodeWithdraw(
    recipient: Account,
    pid: number,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('masterChefWithdraw', [
      TypesConverter.toAddress(recipient),
      pid,
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

  describe('deposit', () => {
    const amount = fp(1);

    it('can deposit tokens into a masterchef farm', async () => {
      await relayer
        .connect(senderUser)
        .multicall([encodeDeposit(senderUser, recipientUser, bpt1, 0, amount, toChainedReference(0))]);

      await expectChainedReferenceContents(toChainedReference(0), amount);

      let senderBptBalance = await bpt1.balanceOf(senderUser);
      expect(senderBptBalance.toString()).to.equal(INITIAL_AMOUNT.sub(amount).toString());

      let masterchefBptBalance = await bpt1.balanceOf(masterChefContract);
      expect(masterchefBptBalance.toString()).to.equal(amount.toString());

      const bpt2Amount = fp(10);

      await relayer
        .connect(senderUser)
        .multicall([encodeDeposit(senderUser, recipientUser, bpt2, 1, bpt2Amount, toChainedReference(1))]);

      await expectChainedReferenceContents(toChainedReference(1), bpt2Amount);

      senderBptBalance = await bpt2.balanceOf(senderUser);
      expect(senderBptBalance.toString()).to.equal(INITIAL_AMOUNT.sub(bpt2Amount).toString());

      masterchefBptBalance = await bpt2.balanceOf(masterChefContract);
      expect(masterchefBptBalance.toString()).to.equal(bpt2Amount.toString());
    });

    it('retrieves the correct chained reference amount and deposits that amount of tokens into the farm', async () => {
      const ref = toChainedReference(0);
      await setChainedReferenceContents(ref, amount);

      await relayer
        .connect(senderUser)
        .multicall([encodeDeposit(senderUser, recipientUser, bpt1, 0, ref, toChainedReference(1))]);

      await expectChainedReferenceContents(toChainedReference(1), amount);

      const senderBptBalance = await bpt1.balanceOf(senderUser);
      expect(senderBptBalance.toString()).to.equal(INITIAL_AMOUNT.sub(amount).toString());

      const masterchefBptBalance = await bpt1.balanceOf(masterChefContract);
      expect(masterchefBptBalance.toString()).to.equal(amount.toString());
    });

    it('fails to deposit tokens when the token does not match the pid', async () => {
      const calls = [encodeDeposit(senderUser, recipientUser, bpt2, 0, amount, toChainedReference(0))];

      try {
        await relayer.connect(senderUser).multicall(calls);
        expect(true).to.equal(false);
      } catch (e) {
        expect(e.message.indexOf('Incorrect token for pid')).to.not.equal(-1);
      }
    });

    it('fails to deposit tokens when the token does not have a farm', async () => {
      const calls = [encodeDeposit(senderUser, recipientUser, otherToken, 1, amount, toChainedReference(0))];

      try {
        await relayer.connect(senderUser).multicall(calls);
        expect(true).to.equal(false);
      } catch (e) {
        expect(e.message.indexOf('Incorrect token for pid')).to.not.equal(-1);
      }
    });
  });

  describe('withdraw', () => {
    const amount = fp(1);

    it('can withdraw tokens from a masterchef farm', async () => {
      await relayer.connect(senderUser).multicall([encodeDeposit(senderUser, recipientUser, bpt1, 0, amount)]);

      const senderBptBalance = await bpt1.balanceOf(senderUser);
      expect(senderBptBalance.toString()).to.equal(INITIAL_AMOUNT.sub(amount).toString());

      const masterchefBptBalance = await bpt1.balanceOf(masterChefContract);
      expect(masterchefBptBalance.toString()).to.equal(amount.toString());

      await relayer.connect(senderUser).multicall([encodeWithdraw(senderUser, 0, amount, toChainedReference(0))]);

      await expectChainedReferenceContents(toChainedReference(0), amount);

      const senderBptBalanceAfter = await bpt1.balanceOf(senderUser);
      expect(senderBptBalanceAfter.toString()).to.equal(INITIAL_AMOUNT.toString());

      const masterchefBptBalanceAfter = await bpt1.balanceOf(masterChefContract);
      expect(masterchefBptBalanceAfter.toString()).to.equal('0');
    });

    it('retrieves the correct chained reference amount and withdraws that amount of tokens from the farm', async () => {
      const amountDeposited = fp(10);
      await relayer.connect(senderUser).multicall([encodeDeposit(senderUser, recipientUser, bpt1, 0, amountDeposited)]);

      const ref = toChainedReference(0);
      await setChainedReferenceContents(ref, amount);

      await relayer.connect(senderUser).multicall([encodeWithdraw(senderUser, 0, ref, toChainedReference(1))]);

      await expectChainedReferenceContents(toChainedReference(1), amount);

      const senderBptBalance = await bpt1.balanceOf(senderUser);
      expect(senderBptBalance.toString()).to.equal(INITIAL_AMOUNT.sub(amountDeposited).add(amount).toString());

      const masterchefBptBalance = await bpt1.balanceOf(masterChefContract);
      expect(masterchefBptBalance.toString()).to.equal(amountDeposited.sub(amount).toString());
    });
  });
});
