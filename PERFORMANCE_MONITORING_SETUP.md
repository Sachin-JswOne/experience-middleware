# Sentry Performance Monitoring Enhancement

## Summary of Changes to `instrumentation.ts`

### ✅ What Was Added

I've enhanced your Sentry configuration with the following performance monitoring integrations:

#### **1. Core Integrations**

- **`httpIntegration()`** - Automatically instruments all HTTP requests (both incoming and outgoing)
- **`expressIntegration()`** - Tracks Express.js middleware and routing
- **`nestIntegration()`** - NestJS-specific instrumentation for controllers, services, and exception filters
- **`redisIntegration()`** - Monitors Redis/ioredis cache operations (you're using ioredis)
- **`spotlightIntegration()`** - Local debugging tool (only enabled in non-production environments)

#### **2. Smart Sampling Rates**

```typescript
// Production: 10% sampling (reduces costs while maintaining visibility)
// Dev/QA: 100% sampling (full visibility for debugging)
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
```

#### **3. Event Filtering**

- **`beforeSend`** - Filters out health check endpoint errors
- **`beforeSendTransaction`** - Filters out health check transactions
- **`ignoreErrors`** - Ignores common non-actionable errors

#### **4. Environment Configuration**

- Dynamic environment detection from `NODE_ENV`
- Release version tracking via `RELEASE_VERSION` env variable

---

## What This Gives You

### 🎯 **Automatic Performance Tracking**

1. **HTTP Requests**
   - All incoming requests to your NestJS controllers
   - All outgoing HTTP calls (including your proxy service calls)
   - Request/response timing
   - Status codes and errors

2. **Express Middleware**
   - Middleware execution time
   - Route matching performance
   - Request pipeline visibility

3. **NestJS Framework**
   - Controller method execution
   - Service method calls
   - Exception filter tracking
   - Guard and interceptor performance

4. **Redis Cache Operations**
   - Cache GET/SET operations (already instrumented in your code)
   - Connection pool performance
   - Cache hit/miss rates

5. **CPU Profiling**
   - Identifies performance bottlenecks in your code
   - Shows which functions consume the most CPU time

---

## What You Already Have (From Your Implementation)

Based on the `SENTRY_TRACING_IMPLEMENTATION.md`, you've already manually instrumented:

✅ **Proxy Controller** - Transaction wrapping with breadcrumbs
✅ **Proxy Service** - Custom spans for:

- Route finding
- Cache operations
- Conditional routing
- Parallel/Sequential aggregation
- Transform operations
- HTTP client calls

### **Combined Power**

The **automatic integrations** + your **manual instrumentation** = **Complete observability**

- Automatic integrations handle the framework-level tracking
- Your manual spans provide business-logic-specific insights
- Together they create a complete performance picture

---

## Sentry Dashboard Views

### **Performance Tab**

1. **Transactions** - See all API requests with timing
2. **Operations** - Filter by:
   - `http.server` - Incoming requests
   - `http.client` - Outgoing requests
   - `cache.get` / `cache.set` - Redis operations
   - `proxy.transform` - Your custom transform operations
3. **Traces** - Full waterfall view of request flow

### **Issues Tab**

1. **Errors** - All captured exceptions with context
2. **Tags** - Filter by:
   - `route_path`
   - `error_type`
   - `aggregation.type`
   - `status_code`

---

## Environment Variables to Set

Add these to your `.env` or deployment config:

```bash
# Required
NODE_ENV=production  # or 'development', 'qa', etc.

# Optional but recommended
RELEASE_VERSION=v1.0.0  # Your app version for tracking
```

---

## Spotlight for Local Debugging

In dev/qa environments, Sentry Spotlight provides a local debugging UI:

1. **Install Spotlight** (if not already):

   ```bash
   npm install @spotlightjs/spotlight
   ```

2. **Access the UI** at `http://localhost:8969` when running locally

3. **See real-time**:
   - All Sentry events
   - Performance traces
   - Errors with full context
   - No need to check Sentry dashboard

---

## Cost Optimization

The 10% sampling rate in production means:

- Only 10% of requests are fully traced
- Errors are still captured 100%
- Significant cost savings on high-traffic apps
- Still enough data for performance insights

If you need more data, adjust the sampling rate:

```typescript
tracesSampleRate: 0.5; // 50% sampling
```

---

## Next Steps

### **1. Test Locally**

```bash
npm run start:dev
```

- Make some requests to your API
- Check Spotlight at `http://localhost:8969`
- Verify traces are being captured

### **2. Deploy to QA**

- Set `NODE_ENV=qa`
- Monitor Sentry dashboard for traces
- Verify all integrations are working

### **3. Production Deployment**

- Set `NODE_ENV=production`
- Set `RELEASE_VERSION` to your app version
- Monitor performance and errors

### **4. Create Alerts** (in Sentry Dashboard)

- High error rate alerts
- Slow transaction alerts
- Cache failure alerts

---

## Additional Recommendations

### **1. Add Health Check Endpoint**

If you don't have one, add a health check that we're filtering out:

```typescript
@Get('/health')
healthCheck() {
  return { status: 'ok' };
}
```

### **2. Consider Adding User Context**

In your authentication middleware:

```typescript
Sentry.setUser({
  id: user.id,
  email: user.email,
  // Don't include sensitive data
});
```

### **3. Add Custom Metrics**

For business-specific metrics:

```typescript
Sentry.metrics.increment('cache.hit');
Sentry.metrics.distribution('response.size', responseSize);
```

---

## Documentation

- [Sentry NestJS Docs](https://docs.sentry.io/platforms/javascript/guides/nestjs/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Profiling](https://docs.sentry.io/product/profiling/)
- [Spotlight](https://spotlightjs.com/)

---

## Summary

✅ **Added 5 new integrations** for comprehensive monitoring
✅ **Smart sampling** to reduce costs in production
✅ **Event filtering** to avoid noise from health checks
✅ **Environment-aware** configuration
✅ **Local debugging** with Spotlight
✅ **Works seamlessly** with your existing manual instrumentation

Your performance monitoring setup is now **production-ready** and **comprehensive**! 🎉
