from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    PlainSerializer,
    ValidationInfo,
    field_validator,
    model_validator,
)
from pydantic_core import PydanticCustomError

# Limits mirror the NUMERIC column definitions in models.py.
Price = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=4)]
Shares = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=8)]
Fee = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=4)]
PlanAmount = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=4)]

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

# The brokers a trade can name: TBC Bank and Bank of Georgia. Add one here,
# and to BROKERS in frontend/src/brokers.ts; the database needs no change.
Broker = Literal["tbc", "bog"]

# How often a plan's amount is put in. Adding one means adding it here, to the
# check on users.plan_period (a migration), to period_bounds in
# app/portfolio.py and to PERIODS in frontend/src/plan.ts.
PlanPeriod = Literal["weekly", "monthly", "quarterly"]


class TradeIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    side: Literal["buy", "sell"] = "buy"
    ticker: Annotated[str, Field(min_length=1, max_length=12, pattern=r"^[A-Za-z0-9.\-]+$")]
    price: Price
    shares: Shares
    trade_date: date
    # Why the trade was made: the reason for buying, or for selling.
    thesis: Annotated[str, Field(min_length=1, max_length=5000)]
    forecast: Annotated[str, Field(max_length=5000)] = ""
    take_profit: Price | None = None
    stop_loss: Price | None = None
    # Purchases only: paid with cash from earlier sales rather than new money.
    paid_from_cash: bool = False
    # The broker's commission. Declared after price and shares, which checking it needs.
    fee: Fee = Decimal(0)
    # Which broker the trade was placed with. Purchases and sales both have one.
    broker: Broker | None = None

    @field_validator("ticker")
    @classmethod
    def uppercase_ticker(cls, value: str) -> str:
        return value.upper()

    @field_validator("take_profit", "stop_loss", "broker", mode="before")
    @classmethod
    def blank_is_none(cls, value: object) -> object:
        # Forms submit empty inputs as "" rather than omitting them.
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("fee", mode="before")
    @classmethod
    def blank_fee_is_zero(cls, value: object) -> object:
        # An empty fee field means the broker charged nothing.
        if value is None or (isinstance(value, str) and not value.strip()):
            return Decimal(0)
        return value

    @field_validator("fee")
    @classmethod
    def fee_fits_a_sale(cls, fee: Decimal, info: ValidationInfo) -> Decimal:
        # A sale's fee comes out of what it brings in, which can't drop below nothing.
        data = info.data
        if (
            data.get("side") == "sell"
            and "price" in data
            and "shares" in data
            and fee > data["price"] * data["shares"]
        ):
            raise PydanticCustomError(
                "fee_too_large", "The fee can't be more than the sale brings in."
            )
        return fee

    @model_validator(mode="after")
    def sales_have_no_plan(self) -> Self:
        # A forecast, price targets and how it was paid for describe a purchase.
        # A sale only records what happened; its money becomes cash.
        if self.side == "sell":
            self.forecast = ""
            self.take_profit = None
            self.stop_loss = None
            self.paid_from_cash = False
        return self


class TradeOut(TradeIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Price times shares, before any fee.
    amount: Decimal
    # The money the trade moved, fee included: a purchase's cost plus its fee,
    # or what a sale brought in after its fee.
    net_amount: Decimal
    take_profit_pct: Percent | None
    stop_loss_pct: Percent | None
    created_at: datetime
    updated_at: datetime

    # The latest price of the ticker, when one is known.
    current_price: Decimal | None = None
    price_at: datetime | None = None

    # Purchases only: how many of these shares are still held. Sales use up the
    # oldest shares of a ticker first.
    remaining_shares: Decimal | None = None
    # Purchases only: what the shares still held are worth, and their gain so
    # far. None without a live price or once everything has been sold.
    current_value: Decimal | None = None
    gain: Decimal | None = None
    gain_pct: Percent | None = None

    # The gain actually made: on a sale, or on the sold part of a purchase.
    # None for a purchase that hasn't been sold from.
    realized_gain: Decimal | None = None
    realized_gain_pct: Percent | None = None
    # Sales only: what the shares sold had cost to buy.
    cost_basis: Decimal | None = None
    # Purchases only: how much of the cost came from cash from sales. The rest
    # was new money. Can be less than the cost even when paid_from_cash is set,
    # if there wasn't that much cash on the purchase's date.
    cash_used: Decimal | None = None


class Position(BaseModel):
    """The shares of one ticker that are still held."""

    ticker: str
    shares: Decimal
    cost: Decimal
    average_price: PerShare
    # When the ticker was first bought. Keeps its place and colour in the chart stable.
    first_trade_date: date
    current_price: Decimal | None
    # Market value, or the cost when there is no live price, so totals still add up.
    value: Decimal
    gain: Decimal | None
    gain_pct: Percent | None
    # This position's share of the whole portfolio, by value.
    share_pct: Percent


class Totals(BaseModel):
    # What the shares still held cost to buy, fees included (their cost basis).
    # Grows when gains from sales are reinvested, without any new money.
    invested: Decimal
    # The user's own money: every purchase with its fee, less what cash from
    # sales paid for. Sales take nothing out; their money stays as cash.
    money_in: Decimal
    # Cash from sales not spent on purchases yet.
    cash: Decimal
    # What the shares still held are worth. None when live prices are off or
    # nothing could be priced.
    current_value: Decimal | None = None
    # What the shares still held are worth plus the cash: the headline figure.
    # None when shares are held but can't be valued.
    total_value: Decimal | None = None
    # total_value against money_in: the gain on the shares still held plus every
    # sale's gain. None when total_value is, or nothing was put in yet.
    total_gain: Decimal | None = None
    total_gain_pct: Percent | None = None
    gain: Decimal | None = None
    gain_pct: Percent | None = None
    # Gain made on every sale so far, after fees.
    realized_gain: Decimal
    sale_count: int
    # Every fee paid, on purchases and sales, and what share of the money traded
    # (price times shares, all trades) that is. None before any trade.
    fees: Decimal
    fees_pct: Percent | None = None
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
    bought: Decimal
    sold: Decimal
    fees: Decimal


class Summary(Totals):
    trade_count: int
    # The plan: how much new money is meant to go in every week, month or quarter.
    plan_amount: Decimal
    plan_period: PlanPeriod
    # New money put into purchases in the period going on now, to compare with the plan.
    this_period: Decimal
    # That period's purchases paid with cash from sales, which the plan leaves out.
    this_period_from_cash: Decimal
    years: list[YearTotal]


# Accounts.

PASSWORD_MIN = 8
PASSWORD_MAX = 128


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


def _no_spaces(value: object) -> object:
    # A code may be pasted as "123 456".
    return "".join(value.split()) if isinstance(value, str) else value


# Lowercased whole, so You@Example.com and you@example.com are one account.
Email = Annotated[EmailStr, BeforeValidator(_strip), AfterValidator(str.lower)]
# Spaces are allowed and kept: they can be part of a password.
NewPassword = Annotated[str, Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)]
# Checking a password doesn't repeat the rules for new ones.
GivenPassword = Annotated[str, Field(min_length=1, max_length=PASSWORD_MAX)]
Code = Annotated[str, BeforeValidator(_no_spaces), Field(pattern=r"^[0-9]{6}$")]
# "web" signs a browser in with a cookie. "app" returns the token instead, for
# the iOS app to keep in the Keychain and send as "Authorization: Bearer".
Client = Literal["web", "app"]


class SignUpIn(BaseModel):
    email: Email
    password: NewPassword
    # Their own plan. Both are required: none is assumed for anyone.
    plan_amount: PlanAmount
    plan_period: PlanPeriod


class SignInIn(BaseModel):
    email: Email
    password: GivenPassword
    client: Client = "web"


class EmailIn(BaseModel):
    email: Email


class ConfirmIn(BaseModel):
    email: Email
    code: Code
    client: Client = "web"


class ResetPasswordIn(BaseModel):
    email: Email
    code: Code
    new_password: NewPassword
    client: Client = "web"


class PasswordChangeIn(BaseModel):
    current_password: GivenPassword
    new_password: NewPassword


class PasswordIn(BaseModel):
    password: GivenPassword


class AccountUpdate(BaseModel):
    plan_amount: PlanAmount
    plan_period: PlanPeriod


class Account(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: str
    plan_amount: Decimal
    plan_period: PlanPeriod
    created_at: datetime
    # The broker of the trade recorded most recently, for a new trade to start
    # with. Only filled in by GET /api/me.
    last_broker: Broker | None = None


class SignedIn(BaseModel):
    account: Account
    # Only for client "app": the token to send as "Authorization: Bearer <token>",
    # and when it stops working unless used. A browser gets it as a cookie instead.
    token: str | None = None
    expires_at: datetime | None = None


class CodeSent(BaseModel):
    """The same answer whether or not the address has an account."""

    email: str


class AuthOptions(BaseModel):
    sign_up_open: bool
