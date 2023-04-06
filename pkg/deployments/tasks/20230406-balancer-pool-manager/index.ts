import Task from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { BalancerPoolManagerDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as BalancerPoolManagerDeployment;

  const args = [input.Owner];
  await task.deployAndVerify('BalancerPoolManager', args, from, force);
};
