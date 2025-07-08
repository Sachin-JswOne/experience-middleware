package com.jswone.experiencemiddleware.service.impl;

import com.jswone.experiencemiddleware.factory.WebClientFactory;
import com.jswone.experiencemiddleware.service.WebClientService;
import com.jswone.experiencemiddleware.util.JsonConversionUtil;
import java.net.URI;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

@Service
@RequiredArgsConstructor
@Slf4j
public class WebClientServiceImpl implements WebClientService {

    private final WebClientFactory webClientFactory;

    private static Function<ClientResponse, Mono<WebClientResponseException>> getDefaultErrorHandler() {
        return (clientResponse -> {
            log.error("Exception in downstream API: {}", clientResponse);
            var httpStatus = clientResponse.statusCode();
            return clientResponse.bodyToMono(Object.class).map(responseBody -> {
                log.error("Response body from downstream: {}", responseBody);
                return new WebClientResponseException(JsonConversionUtil.toStringSilently(responseBody), httpStatus.value(), httpStatus.toString(), null, null, null);
            });
        });
    }

    public <T> Mono<T> makePostCall(String webClientName, URI uri, HttpHeaders httpHeaders, String payload, ParameterizedTypeReference<T> typeReference) {
        var webClient = webClientFactory.getWebClient(webClientName);
        return webClient.post().uri(uri)
                .body(BodyInserters.fromValue(payload))
                .headers(headers -> headers.addAll(httpHeaders))
                .retrieve()
                .onRawStatus(status -> status == UNKNOWN_HTTP_RESPONSE_CODE, clientResponse -> webClientName.getError4xxHandler().apply(clientResponse))
                .onStatus(HttpStatusCode::is4xxClientError, clientResponse -> webClientName.getError4xxHandler().apply(clientResponse))
                .onStatus(HttpStatusCode::is5xxServerError, clientResponse -> webClientName.getError5xxHandler().apply(clientResponse))
                .bodyToMono(typeReference);
    }

    @SmartLogging(loggingEvent = HttpRequestLogEvent.class, loggerName = SmartLoggerName.REACTIVE_AVRO_LOGGER)
    public <T> Mono<T> makeGetCall(WebClientName webClientName, URI uri, HttpHeaders httpHeaders, ParameterizedTypeReference<T> typeReference) {
        var webClient = webClientProvider.getWebClient(webClientName);
        return webClient.get().uri(uri)
                .headers(headers -> headers.addAll(httpHeaders))
                .retrieve()
                .onStatus(HttpStatus::is4xxClientError, clientResponse -> webClientName.getError4xxHandler().apply(clientResponse))
                .onStatus(HttpStatus::is5xxServerError, clientResponse -> webClientName.getError5xxHandler().apply(clientResponse))
                .bodyToMono(typeReference);
    }
}
