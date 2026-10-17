import type { Metadata } from "next";
import { IconChat } from "../../../components/icons";
import styles from "./chats.module.css";

export const metadata: Metadata = { title: "Chats" };

export default function ChatsIndex() {
  return (
    <section
      className={styles.placeholder}
      aria-label="No conversation selected"
    >
      <IconChat size={40} />
      <h2>Pick a conversation</h2>
      <p>Your messages with filmmakers and collaborators appear on the left.</p>
    </section>
  );
}
