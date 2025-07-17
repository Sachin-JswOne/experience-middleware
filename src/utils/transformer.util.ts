/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

export async function applyTransform(
  fnPath: string,
  request: any,
): Promise<any> {
  const [moduleName, fnName] = [
    fnPath.slice(0, fnPath.lastIndexOf('.')),
    fnPath.slice(fnPath.lastIndexOf('.') + 1),
  ];
  const module = await import(`../transformations/${moduleName}`);
  return module[fnName](request);
}
