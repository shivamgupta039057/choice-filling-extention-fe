import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { controlFilling } from "../features/helper/helperSlice";

export function useFillStatusPolling() {
  const dispatch = useDispatch();
  const running = useSelector((state) => state.helper.jobState.running);

  useEffect(() => {
    if (!running) return undefined;

    const timer = window.setInterval(() => {
      dispatch(controlFilling("MCC_FILL_STATUS"));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [dispatch, running]);
}
