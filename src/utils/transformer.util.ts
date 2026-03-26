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

export async function getInterceptor(interceptorName: string): Promise<any> {
  try {
    const [moduleName, interceptorFunctionName] = interceptorName.split('.interceptors.');
    const module = await import(`../interceptors/${moduleName}.interceptors`);
    return module[interceptorFunctionName];
  } catch (error) {
    throw new Error(`Error loading interceptor ${interceptorName}: ${error.message}`);
  }
}
