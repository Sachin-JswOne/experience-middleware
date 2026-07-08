import { combineReducers } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // defaults to localStorage

import { tempDataReducer } from '@/lib/tempData';

const persistConfig = {
  key: 'root',
  storage
};

const rootReducer = combineReducers({ tempData: tempDataReducer });

export const persistedReducer = persistReducer(persistConfig, rootReducer);
