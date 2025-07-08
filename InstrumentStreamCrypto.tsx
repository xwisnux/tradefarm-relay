import { PropertyControls, ControlType } from "framer"
import { useState, useEffect, useRef } from "react"

const MarketDataSocketUrl = "wss://instrument-prices.tradefarm.io"

interface IProps {
    titlesAndInstrumentsGap: string
}

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

// 🔐 Use real available crypto pairs
const CRYPTO_SYMBOLS = [
    "BTCUSD",
    "ETHUSD",
    "SOLUSD",
    "BNBUSD",
    "ADAUSD",
]

// Normalize WebSocket symbol: remove .b suffix
const normalizeSymbol = (raw: string) => raw.replace(".b", "")

export default function InstrumentStreamCrypto(props: IProps) {
    const [symbols, setSymbols] = useState<string[]>([])
    const [instrumentsData, setInstrumentsData] = useState<IInstrumentData[]>([])
    const [symbolsPriceCache, setSymbolsPriceCache] = useState<ISymbolsPriceCache>({})
    const ws = useRef<WebSocket | null>(null)

    useEffect(() => {
        if (ws.current) return

        ws.current = new WebSocket(MarketDataSocketUrl)

        ws.current.onopen = () => {
            ws.current?.send(JSON.stringify({ type: "FetchSymbols" }))
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
                    const filtered = message.symbols.filter((s: string) =>
                        CRYPTO_SYMBOLS.includes(normalizeSymbol(s))
                    )
                    setSymbols(filtered)

                    const placeholderData = filtered.map((symbol) => ({
                        symbol: normalizeSymbol(symbol),
                        ask: "-",
                        bid: "-",
                        spread: "-",
                        leverage: "-",
                    }))
                    setInstrumentsData(placeholderData)

                    ws.current?.send(
                        JSON.stringify({
                            type: "SubscribeSymbols",
                            symbols: filtered,
                        })
                    )
                    break

                case "PriceUpdate":
                    const rawSymbol: string = message.symbol
                    const symbol = normalizeSymbol(rawSymbol)

                    const ask =
                        message.prices[0].Type === "O"
                            ? `${message.prices[0].Px}`
                            : `${message.prices[1].Px}`
                    const bid =
                        message.prices[0].Type === "B"
                            ? `${message.prices[0].Px}`
                            : `${message.prices[1].Px}`

                    if (!ask || !bid) return

                    const updated: IInstrumentData = {
                        symbol,
                        ask,
                        bid,
                        spread: (+ask - +bid).toFixed(5),
                        leverage: "-",
                    }

                    setSymbolsPriceCache((prev) => ({
                        ...prev,
                        [symbol]: updated,
                    }))

                    setInstrumentsData((prev) =>
                        prev.map((item) =>
                            item.symbol === symbol ? updated : item
                        )
                    )
                    break
            }
        }

        return () => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.close()
            }
        }
    }, [])

    const { titlesAndInstrumentsGap } = props

    return (
        <div
            className="flex-align-center"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: titlesAndInstrumentsGap,
            }}
        >
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: "left", paddingBottom: "8px" }}>Instrument</th>
                        <th>Bid</th>
                        <th>Ask</th>
                        <th>Spread</th>
                        <th style={{ textAlign: "right", paddingRight: "0" }}>Leverage</th>
                    </tr>
                </thead>
                <tbody>
                    {instrumentsData.map(({ symbol, bid, ask, spread, leverage }) => (
                        <tr key={symbol}>
                            <td style={{ textAlign: "left", padding: "20px 0" }}>
                                {symbol.replace("USD", "/USDT")}
                            </td>
                            <td style={{ textAlign: "center" }}>{bid}</td>
                            <td style={{ textAlign: "center" }}>{ask}</td>
                            <td style={{ textAlign: "center" }}>{spread}</td>
                            <td style={{ textAlign: "right", paddingRight: "0" }}>{leverage}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

InstrumentStreamCrypto.defaultProps = {
    titlesAndInstrumentsGap: "40px",
} as IProps

export const propertyControls: PropertyControls<IProps> = {
    titlesAndInstrumentsGap: {
        type: ControlType.String,
        title: "Gap",
    },
}
