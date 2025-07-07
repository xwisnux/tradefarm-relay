import { PropertyControls, ControlType } from "framer"
import { useState, useEffect, useRef } from "react"

const MarketDataSocketUrl = "wss://instrument-prices.tradefarm.io"

interface IProps {
    titlesAndInstrumentsGap: string
}

/**
 * @framerSupportedLayoutWidth auto
 * @framerSupportedLayoutHeight auto
 */

type InstrumentTypes =
    | "forex"
    | "commodities"
    | "indices"
    | "stocks"
    | "cryptocurrencires"
    | null

interface IInstrumentData {
    symbol: string
    bid: string
    ask: string
    spread: string
    leverage: string
}

interface ISymbolsPriceCache {
    [symbol: string]: IInstrumentData
}

export default function InstrumentStream(props: IProps) {
    const [symbols, setSymbols] = useState<string[]>([])
    const [instrumentsData, setInstrumentsData] = useState<IInstrumentData[]>(
        []
    )
    const [subscribedSymbols, setSubscribedSymbols] = useState(new Set([]))
    const [activePagi, setActivePagi] = useState<number>(1)
    const [symbolsPriceCache, setSymbolsPriceCache] =
        useState<ISymbolsPriceCache>({})

    const ws = useRef<WebSocket | null>(null)

    // manually add a style to prevent horizontal scroll bar showin on chroming browser
    useEffect(() => {
        const style = document.createElement("style")
        style.id = "custom-scrollbar-style" // Give it an ID to prevent duplicates if component re-renders

        style.innerHTML = `
            .hide-hor-scroll-bar::-webkit-scrollbar {
                    display: none;
            }

            .inst-ctrl-btn:hover {
                box-shadow: 0px 2px 4px RGB(0, 0, 0, .19) !important;
            }

            .inst-ctrl-btn--active {
                background-color: rgba(40, 215, 9, 0.8) !important;
            }

            @media (min-width: 768px) {
                .flex-align-center {
                    align-items: center;
                }
            }

            @media (max-width: 768px) {
                .hide-on-mobile {
                    display: none;
                }
            }
        `

        document.head.appendChild(style)

        // Clean up the style when the component unmounts
        return () => {
            const existingStyle = document.getElementById(
                "custom-scrollbar-style"
            )
            if (existingStyle) {
                existingStyle.remove()
            }
        }
    }, [])

    // establish and manage websocket conections
    useEffect(() => {
        if (ws.current) return

        try {
            ws.current = new WebSocket(MarketDataSocketUrl)

            ws.current.onopen = (event) => {
                ws.current.send(
                    JSON.stringify({
                        type: "FetchSymbols",
                    })
                )
            }

            ws.current.onclose = (event) => {
                console.log("WebSocket Disconnected:", event.code, event.reason)
            }

            ws.current.onerror = (error) => {
                console.error("WebSocket Error:", error)
            }

            ws.current.onmessage = (event) => {
                const message = JSON.parse(event.data)

                switch (message.type) {
                    case "Symbols":
                        setSymbols(message.symbols)
                        // subscribe to the first 6 symbols then default them to 0 on the UI until we get price update
                        let toSubscribeSymbols
                        let toShowSymbols
                        if (symbols.length > 30) {
                            // we want to subscribe to the next set of symbols so user don't get a loading screen if they clik next
                            toSubscribeSymbols = symbols.slice(0, 20)
                        } else {
                            toSubscribeSymbols = symbols
                        }

                        // we only want to show a max of 6 symbols on each screen
                        if (symbols.length >= 6) {
                            toShowSymbols = symbols.slice(0, 6)
                        } else {
                            toShowSymbols = symbols
                        }

                        if (toShowSymbols)
                            setInstrumentsData(
                                toShowSymbols.map((toSubscribeSymbol) => ({
                                    symbol: toSubscribeSymbol,
                                    ask: "-",
                                    bid: "-",
                                    spread: "-",
                                    leverage: "-",
                                }))
                            )
                        // setActivePagi(1)
                        if (toSubscribeSymbols) {
                            ws.current.send(
                                JSON.stringify({
                                    type: "SubscribeSymbols",
                                    symbols: toSubscribeSymbols,
                                })
                            )
                            setSubscribedSymbols(new Set(toSubscribeSymbols))
                        }
                        break
                    case "PriceUpdate":
                        const ask =
                            message.prices[0].Type === "O"
                                ? `${message.prices[0].Px}`
                                : `${message.prices[1].Px}`
                        const bid =
                            message.prices[0].Type === "B"
                                ? `${message.prices[0].Px}`
                                : `${message.prices[1].Px}`
                        if (!ask || !bid) return

                        const symbolUpdatedPrice = {
                            symbol: message.symbol,
                            ask,
                            bid,
                            spread: (+ask - +bid).toFixed(5),
                            leverage: "-",
                        }

                        setSymbolsPriceCache((prevSymbPriceCache) => {
                            return {
                                ...prevSymbPriceCache,
                                [symbolUpdatedPrice.symbol]: symbolUpdatedPrice,
                            }
                        })

                        setInstrumentsData((prevInstrumentsData) => {
                            const toUpdateInstrumentIndex =
                                prevInstrumentsData.findIndex(
                                    ({ symbol }) => symbol === message.symbol
                                )
                            if (toUpdateInstrumentIndex < 0)
                                return prevInstrumentsData

                            return prevInstrumentsData.map(
                                (instrument, index) => {
                                    if (index === toUpdateInstrumentIndex) {
                                        return symbolUpdatedPrice
                                    }
                                    return instrument
                                }
                            )
                        })
                        break
                    default:
                        break
                }
            }
        } catch (error) {
            console.log("Error with instruments streaming server.")
            console.error(error)
        }

        return () => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.close()
            }
        }
    }, [MarketDataSocketUrl])

    useEffect(() => {
        // update UI
        const symbolsSliceEnd = 6 * activePagi
        const symbolsToUpdateUIWith = symbols.slice(
            symbolsSliceEnd - 6,
            symbolsSliceEnd
        )
        setInstrumentsData(
            symbolsToUpdateUIWith.map((symbolToUpdateUIWith) => {
                if (symbolsPriceCache[symbolToUpdateUIWith])
                    return symbolsPriceCache[symbolToUpdateUIWith]

                return {
                    symbol: symbolToUpdateUIWith,
                    ask: "-",
                    bid: "-",
                    spread: "-",
                    leverage: "-",
                }
            })
        )

        // subscribe symbol
        if (symbols.length > 30 && ws.current) {
            let toSubscribeSymbols = []

            // we want to also subcribe to the next/prev 6 symbols
            // if the activePagi is last/first, else, sub to next & prev
            const paginationCount = Math.ceil(symbols.length / 6)
            if (activePagi === 1) {
                toSubscribeSymbols = symbols.slice(0, 21)
            } else if (activePagi === paginationCount) {
                toSubscribeSymbols = symbols.slice(
                    symbols.length - 6 - 6 >= 0 ? symbols.length - 6 - 6 : 0,
                    symbols.length + 1
                )
            } else {
                // pagi it's in the middle
                const pagiBound = activePagi * 6
                toSubscribeSymbols = symbols.slice(
                    pagiBound - 20,
                    pagiBound + 1 + 6
                )
            }

            ws.current.send(
                JSON.stringify({
                    type: "SubscribeSymbols",
                    symbols: toSubscribeSymbols,
                })
            )
            setSubscribedSymbols((prevSubSymbols) => {
                const newSybSymbols = new Set([...prevSubSymbols])
                toSubscribeSymbols.forEach((toSubscribeSymbol) =>
                    newSybSymbols.add(toSubscribeSymbol)
                )
                return newSybSymbols
            })
        }
    }, [activePagi, symbols, symbolsPriceCache])

    // props
    const { titlesAndInstrumentsGap } = props

    // styles
    const instrumentTableStyle: React.CSSProperties = {
        borderCollapse: "collapse",
        // paddingRight: "7.5px",
        // paddingLeft: "7.5px",
    }
    const instrumentCell: React.CSSProperties = {
        border: "none",
        borderBottom: "1px solid grey",
        textAlign: "center",
        paddingRight: "135px",
    }
    const instrumentHeaderCell: React.CSSProperties = {
        paddingBottom: "8px",
    }
    const instrumentBodyCell: React.CSSProperties = {
        paddingBottom: "25px",
        paddingTop: "25px",
    }
    const instrumentCellFirstElement: React.CSSProperties = {
        textAlign: "left",
    }
    const instrumentCellLastElement: React.CSSProperties = {
        textAlign: "right",
        paddingRight: "0",
    }
    const buttonNextPrev: React.CSSProperties = {
        border: "none",
        borderRadius: "3px",
        width: "84px",
        height: "25px",
        textAlign: "center",
        backgroundColor: "#F3F4F5",
        cursor: "pointer",
        fontWeight: "400",
        fontSize: "12px",
        color: "#999999",
        boxShadow: "0px 1px 2px RGB(0, 0, 0, .19)",
        padding: 0,
        transition: "boxShadow .2",
    }
    const buttonRound: React.CSSProperties = {
        border: "none",
        borderRadius: "50%",
        width: "28px",
        height: "28px",
        textAlign: "center",
        backgroundColor: "#F3F4F5",
        cursor: "pointer",
        fontWeight: "500",
        fontSize: "13px",
        color: "#999999",
        boxShadow: "0px 1px 2px RGB(0, 0, 0, .19)",
        padding: 0,
        transition: "boxShadow .2",
    }
    const buttonElipse: React.CSSProperties = {
        border: "none",
        background: "none",
        fontWeight: "500",
        fontSize: "13px",
        color: "#999999",
        padding: 0,
    }

    // functions
    const generateInstrumentTableData = ({
        symbol,
        bid,
        ask,
        leverage,
        spread,
    }: IInstrumentData) => {
        return (
            <tr>
                <td
                    style={{
                        ...instrumentCell,
                        ...instrumentBodyCell,
                        ...instrumentCellFirstElement,
                    }}
                >
                    {symbol}
                </td>

                <td style={{ ...instrumentCell, ...instrumentBodyCell }}>
                    {bid}
                </td>

                <td style={{ ...instrumentCell, ...instrumentBodyCell }}>
                    {ask}
                </td>

                <td style={{ ...instrumentCell, ...instrumentBodyCell }}>
                    {spread}
                </td>

                <td
                    style={{
                        ...instrumentCell,
                        ...instrumentBodyCell,
                        ...instrumentCellLastElement,
                    }}
                >
                    {leverage}
                </td>
            </tr>
        )
    }

    function generateControlButtons() {
        // we are not generating button for < 6 symbols
        if (symbols.length <= 6) return <></>

        const paginationCount = Math.ceil(symbols.length / 6)

        return (
            <div
                style={{
                    display: "flex",
                    gap: "45px",
                    alignItems: "center",
                }}
            >
                {activePagi > 1 && (
                    <button
                        className="hide-on-mobile inst-ctrl-btn"
                        style={buttonNextPrev}
                        onClick={() =>
                            setActivePagi(
                                (prevActivePagi) => prevActivePagi - 1
                            )
                        }
                    >
                        Previous
                    </button>
                )}

                <div
                    style={{
                        display: "flex",
                        gap: "15px",
                        alignItems: "center",
                    }}
                >
                    {
                        // i am extracting this into a function since it's a bit complicated
                        generateInternalControlButtons(
                            paginationCount,
                            activePagi
                        )
                    }
                </div>

                {activePagi < paginationCount && (
                    <button
                        className="hide-on-mobile inst-ctrl-btn"
                        style={buttonNextPrev}
                        onClick={() =>
                            setActivePagi(
                                (prevActivePagi) => prevActivePagi + 1
                            )
                        }
                    >
                        Next
                    </button>
                )}
            </div>
        )
    }

    function generateInternalControlButtons(
        paginationCount: number,
        activePagi: number
    ): JSX.Element {
        /**
         * we have max of 6 number buttons (7 with elipse)
         * if paginationCount <= 6, we show all buttons of count paginationCount (no elipse)
         *
         * if not:
         * if activePagi < 5, show 1 2 3 4 5 ... n
         * if not:
         * if activePagi >= paginationCount-1, show n-5 n-4 n-3 n-2 n-1 n
         * if not, activePagi-3 activePagi-2 activePagi-1 activePagi activePagi+1 ... n
         */

        if (paginationCount <= 6) {
            return (
                <>
                    {new Array(paginationCount).fill(0).map((_, i) => (
                        <button
                            className={`inst-ctrl-btn ${activePagi === i + 1 ? "inst-ctrl-btn--active" : ""}`}
                            style={buttonRound}
                            key={i + 1}
                            onClick={() => setActivePagi(i + 1)}
                        >
                            {i + 1}
                        </button>
                    ))}
                </>
            )
        } else {
            if (activePagi < 5) {
                return (
                    <>
                        <button
                            className={`inst-ctrl-btn ${activePagi === 1 ? "inst-ctrl-btn--active" : ""}`}
                            style={buttonRound}
                            key={1}
                            onClick={() => setActivePagi(1)}
                        >
                            1
                        </button>
                        <button
                            className={`inst-ctrl-btn ${activePagi === 2 ? "inst-ctrl-btn--active" : ""}`}
                            style={buttonRound}
                            key={2}
                            onClick={() => setActivePagi(2)}
                        >
                            2
                        </button>
                        <button
                            className={`inst-ctrl-btn ${activePagi === 3 ? "inst-ctrl-btn--active" : ""}`}
                            style={buttonRound}
                            key={3}
                            onClick={() => setActivePagi(3)}
                        >
                            3
                        </button>
                        <button
                            className={`inst-ctrl-btn ${activePagi === 4 ? "inst-ctrl-btn--active" : ""}`}
                            style={buttonRound}
                            key={4}
                            onClick={() => setActivePagi(4)}
                        >
                            4
                        </button>
                        <button
                            className={`inst-ctrl-btn ${activePagi === 5 ? "inst-ctrl-btn--active" : ""}`}
                            style={buttonRound}
                            key={5}
                            onClick={() => setActivePagi(5)}
                        >
                            5
                        </button>
                        <button style={buttonElipse}>...</button>
                        <button
                            className={`inst-ctrl-btn ${activePagi === paginationCount ? "inst-ctrl-btn--active" : ""}`}
                            style={buttonRound}
                            key={paginationCount}
                            onClick={() => setActivePagi(paginationCount)}
                        >
                            {paginationCount}
                        </button>
                    </>
                )
            } else {
                if (activePagi >= paginationCount - 1) {
                    return (
                        <>
                            <button
                                className={`inst-ctrl-btn ${activePagi === paginationCount - 5 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={paginationCount - 5}
                                onClick={() =>
                                    setActivePagi(paginationCount - 5)
                                }
                            >
                                {paginationCount - 5}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === paginationCount - 4 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={paginationCount - 4}
                                onClick={() =>
                                    setActivePagi(paginationCount - 4)
                                }
                            >
                                {paginationCount - 4}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === paginationCount - 3 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={paginationCount - 3}
                                onClick={() =>
                                    setActivePagi(paginationCount - 3)
                                }
                            >
                                {paginationCount - 3}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === paginationCount - 2 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={paginationCount - 2}
                                onClick={() =>
                                    setActivePagi(paginationCount - 2)
                                }
                            >
                                {paginationCount - 2}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === paginationCount - 1 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={paginationCount - 1}
                                onClick={() =>
                                    setActivePagi(paginationCount - 1)
                                }
                            >
                                {paginationCount - 1}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === paginationCount ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={paginationCount}
                                onClick={() => setActivePagi(paginationCount)}
                            >
                                {paginationCount}
                            </button>
                        </>
                    )
                } else {
                    return (
                        <>
                            <button
                                className={`inst-ctrl-btn ${activePagi === activePagi - 3 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={activePagi - 3}
                                onClick={() => setActivePagi(activePagi - 3)}
                            >
                                {activePagi - 3}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === activePagi - 2 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={activePagi - 2}
                                onClick={() => setActivePagi(activePagi - 2)}
                            >
                                {activePagi - 2}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === activePagi - 1 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={activePagi - 1}
                                onClick={() => setActivePagi(activePagi - 1)}
                            >
                                {activePagi - 1}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === activePagi ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={activePagi}
                                onClick={() => setActivePagi(activePagi)}
                            >
                                {activePagi}
                            </button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === activePagi + 1 ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={activePagi + 1}
                                onClick={() => setActivePagi(activePagi + 1)}
                            >
                                {activePagi + 1}
                            </button>
                            <button style={buttonElipse}>...</button>
                            <button
                                className={`inst-ctrl-btn ${activePagi === paginationCount ? "inst-ctrl-btn--active" : ""}`}
                                style={buttonRound}
                                key={paginationCount}
                                onClick={() => setActivePagi(paginationCount)}
                            >
                                {paginationCount}
                            </button>
                        </>
                    )
                }
            }
        }
    }

    // jsx
    const instrumentTable = (
        <table style={instrumentTableStyle}>
            <thead>
                <tr>
                    <th
                        style={{
                            ...instrumentCell,
                            ...instrumentHeaderCell,
                            ...instrumentCellFirstElement,
                        }}
                    >
                        Instrument
                    </th>

                    <th
                        style={{
                            ...instrumentCell,
                            ...instrumentHeaderCell,
                        }}
                    >
                        Bid
                    </th>

                    <th
                        style={{
                            ...instrumentCell,
                            ...instrumentHeaderCell,
                        }}
                    >
                        Ask
                    </th>

                    <th
                        style={{
                            ...instrumentCell,
                            ...instrumentHeaderCell,
                        }}
                    >
                        Spread
                    </th>

                    <th
                        style={{
                            ...instrumentCell,
                            ...instrumentHeaderCell,
                            ...instrumentCellLastElement,
                        }}
                    >
                        Leverage
                    </th>
                </tr>
            </thead>

            <tbody>
                {instrumentsData.length > 0 ? (
                    instrumentsData.map((data) =>
                        generateInstrumentTableData(data)
                    )
                ) : (
                    <></>
                )}
            </tbody>
        </table>
    )

    return (
        <div
            className="flex-align-center"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: titlesAndInstrumentsGap,
            }}
        >
            <div
                className="hide-hor-scroll-bar"
                style={{
                    overflowX: "scroll",
                    whiteSpace: "nowrap",
                    msOverflowStyle: "none",
                    scrollbarWidth: "none",
                    flexGrow: "1",
                }}
            >
                {instrumentTable}
            </div>

            {generateControlButtons()}
        </div>
    )
}

InstrumentStream.defaultProps = {
    titlesAndInstrumentsGap: "50px",
} as IProps

export const propertyControls: PropertyControls<IProps> = {
    titlesAndInstrumentsGap: {
        type: ControlType.String,
    },
}
