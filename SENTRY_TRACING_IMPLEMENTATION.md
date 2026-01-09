# Sentry Tracing Implementation for Proxy Controller & Service

## Overview

This document outlines the comprehensive Sentry tracing and performance monitoring implementation added to the proxy controller and service.

## Changes Made

### 1. Proxy Controller (`proxy.controller.ts`)

#### Added Features:

- **Transaction Wrapping**: Each incoming request is wrapped in a Sentry span with operation type `http.server`
- **Request Attributes**: Captures HTTP method, URL, path, and query parameters
- **Breadcrumbs**:
  - Request start breadcrumb with request details
  - Successful response breadcrumb
- **Error Tracking**:
  - Request context capture (method, URL, path, query, headers)
  - Axios error handling with specific tags and contexts
  - Generic error handling with appropriate tags
  - Error type classification (axios_error, custom_error, generic_error)

#### Key Benefits:

- Every API request is tracked as a transaction in Sentry
- Detailed error context helps with debugging
- Request/response flow is visible through breadcrumbs

---

### 2. Proxy Service (`proxy.service.ts`)

#### Added Features:

##### Main Request Handler (`handleRequest`)

- **Span**: `proxy.handleRequest` with operation type `proxy.request`
- **Route Finding**: Wrapped in `proxy.findRoute` span
- **Error Tracking**:
  - Route not found errors
  - Authorization errors with route context
- **Tags**: Route path, method, and handler type

##### Cache Operations

- **Cache GET**:
  - Span: `cache.get` with cache key attribute
  - Breadcrumbs for cache hit/miss
  - Error capture for Redis failures
- **Cache SET**:
  - Span: `cache.set` with cache key attribute
  - Breadcrumb with TTL information
  - Error capture for Redis failures

##### Conditional Request Handler

- **Span**: `proxy.conditional` with route path
- **Features**:
  - Tracks selected target
  - Breadcrumb for target selection
  - Error tracking for missing targets
  - Tags for conditional target

##### Aggregate Request Handler

- **Span**: `proxy.aggregate` with aggregation type
- **Features**:
  - Tags for aggregation type (PARALLEL/SEQUENTIAL)
  - Error tracking for unsupported aggregation types

##### Parallel Aggregation

- **Span**: `aggregate.parallel` with target count
- **Features**:
  - Breadcrumb for parallel processing start
  - Individual target failure breadcrumbs
  - Success/failure count tracking via span attributes
  - Authorization error detection and capture
  - Detailed error context for each failed target

##### Sequential Aggregation

- **Span**: `aggregate.sequential` with target count
- **Features**:
  - Breadcrumb for sequential processing start
  - Success breadcrumb for each target
  - Error breadcrumb for each failed target
  - Success/failure count tracking via span attributes
  - OpenTelemetry events for failed targets

##### Transform Request (HTTP Client)

- **Spans**:
  - OpenTelemetry span: `proxy.transform`
  - Sentry span: `http.request` with operation type `http.client`
- **Features**:
  - Request breadcrumb with method and URL
  - Response size tracking
  - Response data preview (truncated if > 1000 chars)
  - HTTP status code tracking
  - Success response breadcrumb
  - Error response breadcrumb for 4xx/5xx
  - Detailed error tracking:
    - Downstream auth errors (401/403)
    - HTTP errors with response data
    - Network errors (timeout, connection failures)
  - Error context includes:
    - Target name
    - Status code
    - Response data
    - Error type classification

---

## Sentry Features Utilized

### 1. Spans

- Hierarchical performance tracking
- Operation types for filtering (http.server, http.client, cache.get, cache.set, etc.)
- Custom attributes for detailed context

### 2. Breadcrumbs

- Request/response flow tracking
- Cache operations
- Target selection in conditional routing
- Individual target success/failure in aggregations
- HTTP request/response events

### 3. Error Capture

- `Sentry.captureException()` with contextual tags
- Error type classification
- Response data capture
- Custom contexts for different error types

### 4. Tags

- Route path, method, handler type
- Aggregation type
- Conditional target
- HTTP status codes
- Error types

### 5. Span Attributes

- HTTP details (method, URL, path, status)
- Cache keys
- Target counts
- Success/failure counts
- Response sizes
- Error details

---

## Benefits

### 1. Performance Monitoring

- Track request duration from controller to downstream services
- Identify slow cache operations
- Monitor parallel vs sequential aggregation performance
- Track individual HTTP request latencies

### 2. Error Tracking

- Detailed error context for debugging
- Error classification for better filtering
- Downstream service error tracking
- Cache failure monitoring

### 3. Observability

- Complete request flow visibility
- Cache hit/miss tracking
- Target execution tracking in aggregations
- HTTP request/response tracking

### 4. Debugging

- Breadcrumbs provide step-by-step execution flow
- Error contexts include request details
- Response data preview for quick debugging
- Authorization error tracking

---

## Usage in Sentry Dashboard

### Performance Monitoring

1. **Transactions**: View all `GET /public/*` requests
2. **Operations**: Filter by operation type (http.server, http.client, cache.get, etc.)
3. **Tags**: Filter by route.path, route.method, aggregation.type, etc.
4. **Spans**: Drill down into individual operations within a request

### Error Tracking

1. **Error Types**: Filter by error_type tag (axios_error, custom_error, auth_required, etc.)
2. **Routes**: Filter by route_path tag
3. **Targets**: Filter by target tag for downstream errors
4. **Context**: View request details, response data, and error messages

### Breadcrumbs

1. **Request Flow**: See the complete execution path
2. **Cache Operations**: Track cache hits/misses
3. **Aggregations**: See which targets succeeded/failed
4. **HTTP Calls**: View all HTTP requests made

---

## Best Practices Implemented

1. **Hierarchical Spans**: Nested spans for complete request flow
2. **Meaningful Names**: Clear span names for easy identification
3. **Contextual Attributes**: Rich metadata for filtering and analysis
4. **Error Context**: Detailed error information for debugging
5. **Breadcrumbs**: Step-by-step execution tracking
6. **Performance Data**: Response sizes, counts, and timing
7. **Error Classification**: Tagged errors for better organization

---

## Future Enhancements

1. **Custom Metrics**: Add custom measurements for business metrics
2. **User Context**: Add user information to spans
3. **Sampling**: Implement intelligent sampling for high-traffic routes
4. **Alerts**: Configure alerts based on error rates and performance thresholds
5. **Dashboards**: Create custom dashboards for specific use cases
