import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import { ILooseObject } from '@/_types/common.interface';

interface TempDataState {
  data: ILooseObject;
}

const initialState: TempDataState = {
  data: {}
};

const tempDataSlice = createSlice({
  name: 'tempData',
  initialState,
  reducers: {
    setTempData: (state, action: PayloadAction<ILooseObject>) => {
      state.data = action.payload;
    },
    clearTempData: (state) => {
      state.data = {};
    }
  }
});

export const { setTempData, clearTempData } = tempDataSlice.actions;
export const tempDataReducer = tempDataSlice.reducer;
