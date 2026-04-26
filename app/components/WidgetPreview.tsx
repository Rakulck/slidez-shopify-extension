interface WidgetPreviewProps {
  buttonText: string;
  buttonColor: string;
  buttonPosition: "below-add-to-cart" | "above-add-to-cart";
  borderRadius?: number;
  fullWidth?: boolean;
}

export function WidgetPreview({
  buttonText,
  buttonColor,
  buttonPosition,
  borderRadius = 8,
  fullWidth = true,
}: WidgetPreviewProps) {
  const tryOnButton = (
    <div
      style={{
        backgroundColor: buttonColor,
        color: "#ffffff",
        padding: "10px 16px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        cursor: "pointer",
        userSelect: "none",
        width: fullWidth ? "100%" : "auto",
        minWidth: fullWidth ? undefined : 140,
        alignSelf: fullWidth ? undefined : "flex-start",
        boxSizing: "border-box",
      }}
    >
      {buttonText || "Try It On"}
    </div>
  );

  const addToCartButton = (
    <div
      style={{
        backgroundColor: "#111",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      Add to Cart
    </div>
  );

  return (
    <div
      style={{
        border: "1px solid #e1e3e5",
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#fafafa",
        position: "relative",
        minHeight: 280,
        padding: 16,
        fontFamily: "sans-serif",
      }}
    >
      {/* Mock product image */}
      <div
        style={{
          backgroundColor: "#e4e5e7",
          borderRadius: 6,
          height: 120,
          marginBottom: 4,
        }}
      />


      {/* Mock product title */}
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#202223" }}>
        Product Name
      </div>
      <div style={{ fontSize: 12, color: "#6d7175", marginBottom: 12 }}>$99.00</div>

      {/* Buttons in order based on position */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {buttonPosition === "above-add-to-cart" && tryOnButton}
        {addToCartButton}
        {buttonPosition === "below-add-to-cart" && tryOnButton}
      </div>
    </div>
  );
}
