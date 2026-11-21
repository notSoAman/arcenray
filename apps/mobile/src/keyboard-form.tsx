import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  TextInput,
} from "react-native";
import { focusedFieldScrollOffset } from "./keyboard-layout";

type InputHandle = ComponentRef<typeof TextInput>;
const InputFocus = createContext<(input: InputHandle | null) => void>(() => {});
export const useKeyboardFormFocus = () => useContext(InputFocus);

/** OTA-safe keyboard scrolling for every Field in an authentication form. */
export function KeyboardForm({
  children,
  contentContainerStyle,
  onScroll,
  onLayout,
  onContentSizeChange,
  ...props
}: ScrollViewProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const focused = useRef<InputHandle | null>(null);
  const offset = useRef(0);
  const keyboardTop = useRef(
    Keyboard.metrics()?.screenY ?? Number.POSITIVE_INFINITY,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(
    () => Keyboard.metrics()?.height ?? 0,
  );
  const reveal = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const input = focused.current;
      const container = scroll.current;
      if (!input || !container) return;
      input.measureInWindow((_x, y, _width, height) => {
        if (scroll.current !== container) return;
        container.measureInWindow((_vx, top, _vw, viewportHeight) => {
          if (focused.current !== input) return;
          const next = focusedFieldScrollOffset({
            offset: offset.current,
            fieldTop: y,
            fieldHeight: height,
            viewportTop: top,
            viewportBottom: top + viewportHeight,
            keyboardTop: keyboardTop.current,
          });
          if (Math.abs(next - offset.current) > 1)
            container.scrollTo({ y: next, animated: false });
        });
      });
    }, 80);
  }, []);
  const onFocus = useCallback(
    (input: InputHandle | null) => {
      focused.current = input;
      reveal();
    },
    [reveal],
  );
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
      reveal();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = Number.POSITIVE_INFINITY;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reveal]);
  const basePadding = StyleSheet.flatten(contentContainerStyle)?.paddingBottom;
  return (
    <InputFocus.Provider value={onFocus}>
      <ScrollView
        {...props}
        ref={scroll}
        style={[{ flex: 1 }, props.style]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        contentContainerStyle={[
          contentContainerStyle,
          {
            paddingBottom:
              (typeof basePadding === "number" ? basePadding : 24) +
              keyboardHeight,
          },
        ]}
        onLayout={(event) => {
          onLayout?.(event);
          reveal();
        }}
        onContentSizeChange={(width, height) => {
          onContentSizeChange?.(width, height);
          reveal();
        }}
        onScroll={(event) => {
          offset.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
      >
        {children}
      </ScrollView>
    </InputFocus.Provider>
  );
}
