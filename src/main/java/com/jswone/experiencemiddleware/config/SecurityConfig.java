package com.jswone.experiencemiddleware.config;

import com.jswone.experiencemiddleware.filter.ApiKeyAuthFilter;
import com.jswone.experiencemiddleware.property.ApplicationProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.SecurityWebFiltersOrder;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

  @Bean
  public SecurityWebFilterChain securityWebFilterChain(
      ServerHttpSecurity http, ApiKeyAuthFilter apiKeyAuthFilter) {
    return http.csrf(ServerHttpSecurity.CsrfSpec::disable)
        .addFilterAt(apiKeyAuthFilter, SecurityWebFiltersOrder.AUTHENTICATION)
        .build();
  }
}
