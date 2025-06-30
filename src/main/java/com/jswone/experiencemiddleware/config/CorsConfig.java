package com.jswone.experiencemiddleware.config;

import com.jswone.experiencemiddleware.property.ApplicationProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource(ApplicationProperty applicationProperty) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(applicationProperty.getAllowedOrigins());
        config.setAllowedMethods(applicationProperty.getAllowedMethods());
        config.setAllowedHeaders(applicationProperty.getAllowedHeaders());
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return source;
    }
}

