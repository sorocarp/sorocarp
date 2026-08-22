export class Portfolio {
    startingCapital;
    value;
    benchmark;
    history = [];
    maxHistory;
    prevPrices = new Map();
    weights = new Map();
    constructor(startingCapital, maxHistory = 1200) {
        this.startingCapital = startingCapital;
        this.maxHistory = maxHistory;
        this.value = startingCapital;
        this.benchmark = startingCapital;
    }
    reset() {
        this.value = this.startingCapital;
        this.benchmark = this.startingCapital;
        this.history = [];
        this.prevPrices.clear();
        this.weights.clear();
    }
    /**
     * Apply the price move since the last mark using the weights set at that mark,
     * then store the new weights for the next one.
     */
    markToMarket(prices, weights, t = Date.now()) {
        let organismReturn = 0;
        let benchmarkReturn = 0;
        let n = 0;
        for (const [id, price] of prices) {
            const prev = this.prevPrices.get(id);
            if (prev === undefined || prev <= 0 || !Number.isFinite(price))
                continue;
            const r = price / prev - 1;
            organismReturn += (this.weights.get(id) ?? 0) * r;
            benchmarkReturn += r;
            n++;
        }
        if (n > 0)
            benchmarkReturn /= n;
        this.value *= 1 + organismReturn;
        this.benchmark *= 1 + benchmarkReturn;
        this.prevPrices = new Map(prices);
        this.weights = new Map(weights);
        this.history.push({ t, value: this.value, benchmark: this.benchmark });
        if (this.history.length > this.maxHistory)
            this.history.shift();
        return { organismReturn, benchmarkReturn };
    }
    get returnPct() {
        return (this.value / this.startingCapital - 1) * 100;
    }
    get benchmarkReturnPct() {
        return (this.benchmark / this.startingCapital - 1) * 100;
    }
}
