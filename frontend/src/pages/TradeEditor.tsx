import { useParams } from "react-router";

import { api } from "../api";
import { Loadable } from "../components/Loadable";
import { TradeForm } from "../components/TradeForm";
import { today, trimZeros } from "../format";
import type { Trade, TradeInput } from "../types";
import { useApi } from "../useApi";

function toInput(trade: Trade): TradeInput {
  return {
    ticker: trade.ticker,
    buy_price: trimZeros(trade.buy_price),
    shares: trimZeros(trade.shares),
    trade_date: trade.trade_date,
    thesis: trade.thesis,
    forecast: trade.forecast,
    take_profit: trade.take_profit === null ? "" : trimZeros(trade.take_profit),
    stop_loss: trade.stop_loss === null ? "" : trimZeros(trade.stop_loss),
  };
}

export function TradeNew() {
  const blank: TradeInput = {
    ticker: "",
    buy_price: "",
    shares: "",
    trade_date: today(),
    thesis: "",
    forecast: "",
    take_profit: "",
    stop_loss: "",
  };
  return (
    <>
      <title>Add trade · Trade Journal</title>
      <TradeForm heading="Add trade" initial={blank} cancelTo="/" save={api.createTrade} />
    </>
  );
}

export function TradeEdit() {
  const id = Number(useParams().id);
  const state = useApi(() => api.getTrade(id), [id]);
  return (
    <Loadable state={state}>
      {(trade) => (
        <>
          <title>{`Edit ${trade.ticker} · Trade Journal`}</title>
          <TradeForm
            heading={`Edit ${trade.ticker}`}
            initial={toInput(trade)}
            cancelTo={`/trades/${trade.id}`}
            save={(input) => api.updateTrade(trade.id, input)}
          />
        </>
      )}
    </Loadable>
  );
}
