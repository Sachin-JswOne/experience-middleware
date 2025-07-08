package com.jswone.experiencemiddleware.factory;

import static com.jswone.experiencemiddleware.constant.ApplicationConstants.WEB_CLIENT_FIXED_POOL;
import static com.jswone.experiencemiddleware.constant.ApplicationConstants.WEB_CLIENT_PREFIX;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jswone.experiencemiddleware.constant.ErrorCode;
import com.jswone.experiencemiddleware.exception.CustomException;
import com.jswone.experiencemiddleware.property.HttpClientProperty;
import io.netty.channel.ChannelOption;
import io.netty.handler.logging.LogLevel;
import io.netty.handler.timeout.ReadTimeoutHandler;
import io.netty.handler.timeout.WriteTimeoutHandler;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.springframework.beans.factory.support.BeanDefinitionBuilder;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.context.ApplicationContext;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.http.codec.json.Jackson2JsonDecoder;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.DefaultUriBuilderFactory;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;
import reactor.netty.transport.logging.AdvancedByteBufFormat;

@Component
public class WebClientFactory {

  private final ApplicationContext applicationContext;
  private final Map<String, WebClient> webClientMap;
  private final ObjectMapper objectMapper;

  public WebClientFactory(
      ApplicationContext applicationContext,
      Map<String, HttpClientProperty> propertiesMap,
      ObjectMapper objectMapper) {
    this.applicationContext = applicationContext;
    this.objectMapper = objectMapper;
    this.webClientMap =
        propertiesMap.entrySet().stream()
            .collect(
                Collectors.toMap(
                    e -> WEB_CLIENT_PREFIX + e.getKey(),
                    e -> createWebClient(e.getKey(), e.getValue())));
  }

  @NonNull
  public WebClient getWebClient(String name) {
    return Optional.ofNullable(webClientMap.get(WEB_CLIENT_PREFIX + name))
        .orElseThrow(() -> new CustomException(ErrorCode.WEB_CLIENT_NOT_FOUND));
  }

  private WebClient createWebClient(String name, HttpClientProperty properties) {
    var fixedPool =
        ConnectionProvider.builder(WEB_CLIENT_FIXED_POOL)
            .maxConnections(properties.maxConnections())
            .pendingAcquireTimeout(Duration.ofMillis(properties.connReqTimeOut()))
            .build();

    var httpClient = createHttpClient(properties, fixedPool);
    var webCLient =
        WebClient.builder()
            .clientConnector(new ReactorClientHttpConnector(httpClient))
            .codecs(
                clientCodecConfigurer ->
                    clientCodecConfigurer
                        .defaultCodecs()
                        .jackson2JsonDecoder(new Jackson2JsonDecoder(objectMapper)))
            .uriBuilderFactory(new DefaultUriBuilderFactory(properties.uri()))
            .build();
    var registry = (BeanDefinitionRegistry) applicationContext.getAutowireCapableBeanFactory();
    registry.registerBeanDefinition(
        WEB_CLIENT_PREFIX + name,
        BeanDefinitionBuilder.genericBeanDefinition(WebClient.class, () -> webCLient)
            .getBeanDefinition());
    return webCLient;
  }

  private HttpClient createHttpClient(HttpClientProperty properties, ConnectionProvider fixedPool) {
    return HttpClient.create(fixedPool)
        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, properties.connectTimeout())
        .responseTimeout(Duration.ofMillis(properties.socketTimeout()))
        .wiretap(
            "reactor.netty.http.client.HttpClient", LogLevel.DEBUG, AdvancedByteBufFormat.TEXTUAL)
        .doOnConnected(
            conn ->
                conn.addHandlerLast(
                        new ReadTimeoutHandler(properties.socketTimeout(), TimeUnit.MILLISECONDS))
                    .addHandlerLast(
                        new WriteTimeoutHandler(
                            properties.socketTimeout(), TimeUnit.MILLISECONDS)));
  }
}
