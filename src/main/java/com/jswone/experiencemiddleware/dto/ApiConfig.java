package com.jswone.experiencemiddleware.dto;

import com.jswone.experiencemiddleware.constant.ApiOperation;

public record ApiConfig<T>(ApiOperation apiOperation, T integrationProperty) {}
