package com.jswone.experiencemiddleware.filter;

import com.jswone.experiencemiddleware.constant.ApplicationConstants;
import com.jswone.experiencemiddleware.constant.ErrorCode;
import com.jswone.experiencemiddleware.property.ApiKeyProperties;
import com.jswone.experiencemiddleware.property.ApplicationProperty;
import com.jswone.experiencemiddleware.response.ResponseObject;
import com.jswone.experiencemiddleware.util.JsonConversionUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
@RequiredArgsConstructor
@Slf4j
public class ApiKeyAuthFilter implements WebFilter {

  private final ApiKeyProperties apiKeyProperties;
  private final ApplicationProperty applicationProperty;

  @Override
  @NonNull
  public Mono<Void> filter(ServerWebExchange exchange, @NonNull WebFilterChain chain) {
    ServerHttpRequest request = exchange.getRequest();
    String requestPath = exchange.getRequest().getPath().value();

    // Skip auth for open paths
    boolean isOpenPath = applicationProperty.getOpenPaths().stream()
            .anyMatch(open -> requestPath.matches(convertAntToRegex(open)));

    if (isOpenPath) {
      return chain.filter(exchange);
    }

    String apiKey = request.getHeaders().getFirst(ApplicationConstants.API_KEY_HEADER);

    if (apiKey == null || apiKey.isBlank()) {
      log.debug("API Key header is missing");
      return unauthorized(exchange, ErrorCode.UNAUTHORIZED);
    }
    return apiKeyProperties
        .getClientForKey(apiKey)
        .map(
            client ->
                chain
                    .filter(exchange)
                    .contextWrite(ctx -> ctx.put(ApplicationConstants.CLIENT_ID, client)))
        .orElseGet(() -> unauthorized(exchange, ErrorCode.FORBIDDEN));
  }

  private Mono<Void> unauthorized(ServerWebExchange exchange, ErrorCode errorCode) {
    exchange.getResponse().setStatusCode(errorCode.getHttpStatus());
    exchange
        .getResponse()
        .getHeaders()
        .add(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
    var response = new ResponseObject<>(errorCode);
    return exchange
        .getResponse()
        .writeWith(
            Mono.just(
                exchange
                    .getResponse()
                    .bufferFactory()
                    .wrap(JsonConversionUtil.toJsonBytesSilently(response))));
  }

  private String convertAntToRegex(String antPattern) {
    return antPattern.replace("**", ".*").replace("*", "[^/]*");
  }
}
