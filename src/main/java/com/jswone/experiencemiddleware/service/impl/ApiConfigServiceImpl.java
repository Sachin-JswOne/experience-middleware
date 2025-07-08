package com.jswone.experiencemiddleware.service.impl;

import com.jswone.experiencemiddleware.constant.ApiOperation;
import com.jswone.experiencemiddleware.constant.ErrorCode;
import com.jswone.experiencemiddleware.dto.ApiConfig;
import com.jswone.experiencemiddleware.exception.CustomException;
import com.jswone.experiencemiddleware.property.RestIntegrationProperty;
import com.jswone.experiencemiddleware.service.ApiConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Slf4j
public class ApiConfigServiceImpl implements ApiConfigService {
    private final Map<String, ApiConfig<?>> apiConfigMap;

public ApiConfigServiceImpl(List<RestIntegrationProperty> restIntegrationPropertyList) {
        this.apiConfigMap = restIntegrationPropertyList.stream()
                .collect(Collectors.toMap(RestIntegrationProperty::path,
                        restIntegrationProperty -> new ApiConfig<>(ApiOperation.REST_API,
                                restIntegrationProperty)));
    }
    @Override
    public <T> ApiConfig<T> getApiConfigForPath(String path) {
    return Optional.ofNullable(apiConfigMap.get(path))
        .map(apiConfig -> (ApiConfig<T>) apiConfig)
        .orElseThrow(() -> new CustomException(ErrorCode.PATH_NOT_SUPPORTED));
    }
}
