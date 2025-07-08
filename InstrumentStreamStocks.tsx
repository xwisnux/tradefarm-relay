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
}

interface ISymbolsPriceCache {
    [symbol: string]: IInstrumentData
}

const STOCK_SYMBOLS = ["TSLA", "AAPL", "NVDA", "AMZN", "META"]

const normalizeSymbol = (raw: string) => raw.replace(".b", "")

export default function InstrumentStreamStocks(props: IProps) {
    const [symbols, setSymbols] = useState<string[]>([])
    const [instrumentsData, setInstrumentsData] = useState<IInstrumentData[]>([])
    const [symbolsPriceCache, setSymbolsPriceCache] = useState<
