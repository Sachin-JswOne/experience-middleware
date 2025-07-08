package com.jswone.experiencemiddleware.service;

import com.jswone.experiencemiddleware.dto.ApiConfig;
import org.springframework.stereotype.Service;

public interface ApiConfigService {
    /**
     * Retrieves the API configuration for the given API path.
     * @param path the API path
     * @param <T> the type of the integration property
     * @return the API configuration for the specified path
     */
    <T> ApiConfig<T> getApiConfigForPath(String path);
}
