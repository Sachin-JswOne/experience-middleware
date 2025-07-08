package com.jswone.experiencemiddleware.property;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@Getter
@Setter
public class ApplicationProperty {

  @Value("${application.allowed-origins:*}")
  private List<String> allowedOrigins;

  @Value("${application.allowed-methods:GET,POST,PUT,DELETE,OPTIONS}")
  private List<String> allowedMethods;

  @Value("${application.allowed-headers:*}")
  private List<String> allowedHeaders;

  @Value(
      "${application.open-paths:/ex-mw/public/**, /ex-mw/api/docs/**, /ex-mw/api/swagger-ui/**, /ex-mw/api/v3/api-docs/**, '/ex-mw/actuator' ,/ex-mw/actuator/**}")
  private List<String> openPaths;

  @ConfigurationProperties(prefix = "http.clients.properties")
  @Bean
  public Map<String, HttpClientProperty> getWebClientProperties() {
    return new HashMap<>();
  }

  @ConfigurationProperties(prefix = "endpoints")
  @Bean
  public List<RestIntegrationProperty> getRestIntegrationProperties() {
    return new ArrayList<>();
  }
}
