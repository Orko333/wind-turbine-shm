declare module 'plotly.js' {
  const Plotly: {
    newPlot(
      id: string | HTMLElement,
      data: Array<Record<string, unknown>>,
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>
    ): Promise<void>;
  };
  export default Plotly;
}
