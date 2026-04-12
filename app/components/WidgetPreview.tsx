interface WidgetPreviewProps {
  buttonText: string;
  buttonColor: string;
  buttonPosition: "below-add-to-cart" | "above-add-to-cart" | "floating-corner";
}

export function WidgetPreview({ buttonText, buttonColor, buttonPosition }: WidgetPreviewProps) {
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
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8c9196",
          fontSize: 12,
        }}
      >
        Product Image
      </div>

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

      {/* Floating corner button */}
      {buttonPosition === "floating-corner" && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            backgroundColor: buttonColor,
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            cursor: "pointer",
          }}
        >
          {buttonText || "Try It On"}
        </div>
      )}
    </div>
  );
}
