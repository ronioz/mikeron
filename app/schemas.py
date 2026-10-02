from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

# Limits mirror the NUMERIC column definitions in models.py.
Price = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=4)]
Shares = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=8)]


# Ratios can have endless decimals (60 / 0.27), so they are cut off on the way
# out. Eight places is far more than any screen shows: whoever displays the
# number does the only real rounding, which avoids rounding twice and landing
# on the wrong side (21.646 -> 21.65 -> 21.7). Amounts of money are exact and
# are sent as they are.
Ratio = Annotated[
    Decimal,
    PlainSerializer(
        lambda value: str(value.quantize(Decimal("0.00000001"))),
        return_type=str,
        when_used="json",
    ),
]
Percent = Ratio
PerShare = Ratio


class TradeIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    ticker: Annotated[str, Field(min_length=1, max_length=12, pattern=r"^[A-Za-z0-9.\-]+$")]
    buy_price: Price
    shares: Shares
    trade_date: date
    thesis: Annotated[str, Field(min_length=1, max_length=5000)]
    forecast: Annotated[str, Field(max_length=5000)] = ""
    take_profit: Price | None = None
    stop_loss: Price | None = None

    @field_validator("ticker")
    @classmethod
    def uppercase_ticker(cls, value: str) -> str:
        return value.upper()

    @field_validator("take_profit", "stop_loss", mode="before")
    @classmethod
    def blank_is_none(cls, value: object) -> object:
        # Forms submit empty inputs as "" rather than omitting them.
        if isinstance(value, str) and not value.strip():
            return None
        return value


class TradeOut(TradeIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cost: Decimal
    take_profit_pct: Percent | None
    stop_loss_pct: Percent | None
    created_at: datetime
    updated_at: datetime
    # Live valuation, all None when there is no price for the ticker.
    current_price: Decimal | None = None
    current_value: Decimal | None = None
    gain: Decimal | None = None
    gain_pct: Percent | None = None
    price_at: datetime | None = None


class Position(BaseModel):
    """Every trade in one ticker, added together."""

    ticker: str
    shares: Decimal
    cost: Decimal
    average_price: PerShare
    trade_count: int
    first_trade_date: date
    current_price: Decimal | None
    # Market value, or the cost when there is no live price, so totals still add up.
    value: Decimal
    gain: Decimal | None
    gain_pct: Percent | None
    # This position's share of the whole portfolio, by value.
    share_pct: Percent


class Totals(BaseModel):
    invested: Decimal
    # None when live prices are off or nothing could be priced.
    current_value: Decimal | None = None
    gain: Decimal | None = None
    gain_pct: Percent | None = None
    # Tickers counted at cost because no live price is available for them.
    unpriced: list[str] = []
    # Age of the oldest price used.
    price_at: datetime | None = None
    prices_enabled: bool


class Portfolio(Totals):
    positions: list[Position]


class YearTotal(BaseModel):
    year: int
    trade_count: int
    invested: Decimal


class Summary(Totals):
    trade_count: int
    this_month: Decimal
    monthly_budget: Decimal
    years: list[YearTotal]
