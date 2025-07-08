package com.jswone.experiencemiddleware.property;

import com.jswone.experiencemiddleware.constant.RestIntegrationType;
import org.springframework.http.HttpMethod;

public record RestIntegrationProperty(
    String path, HttpMethod httpMethod, RestIntegrationType type, String httpClient) {}
