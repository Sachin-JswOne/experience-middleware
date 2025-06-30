package com.jswone.experiencemiddleware.property;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Configuration
@Getter
@Setter
@ConfigurationProperties(prefix = "security")
public class ApiKeyProperties {
    private Map<String, String> apiKeys = new HashMap<>();

    public Optional<String> getClientForKey(String key) {
        return apiKeys.entrySet().stream()
                .filter(entry -> entry.getValue().equals(key))
                .map(Map.Entry::getKey)
                .findFirst();
    }
}

