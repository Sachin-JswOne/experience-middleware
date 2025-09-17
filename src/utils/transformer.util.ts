/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

export async function applyTransform(
  fnPath: string,
  request: any,
  prevResponses?: any[], 
): Promise<any> {
  const [moduleName, fnName] = [
    fnPath.slice(0, fnPath.lastIndexOf('.')),
    fnPath.slice(fnPath.lastIndexOf('.') + 1),
  ];
  const module = await import(`../transformations/${moduleName}`);

    //If prevResponses exist and transformer expects it, pass both
  const transformer = module[fnName];
  if (typeof transformer !== 'function') {
    throw new Error(`Transformer function ${fnName} not found in ${moduleName}`);
  }

  return prevResponses
    ? transformer(request, prevResponses) // (request, prevResponses)
    : transformer(request);
}
