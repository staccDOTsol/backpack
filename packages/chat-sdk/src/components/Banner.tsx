import { BACKEND_API_URL,sendFriendRequest  } from "@coral-xyz/common";
import { toast } from "@coral-xyz/react-common";
import { useCustomTheme } from "@coral-xyz/themes";
import InfoIcon from "@mui/icons-material/Info";

import { useChatContext } from "./ChatContext";
import { useStyles } from "./styles";

export const Banner = () => {
  const {
    areFriends,
    requested,
    remoteUserId,
    spam,
    blocked,
    setRequested,
    setSpam,
    remoteRequested,
    remoteUsername,
    reconnecting,
  } = useChatContext();
  const classes = useStyles();

  if (reconnecting) {
    return (
      <TextBanner
        fixed={true}
        type={"danger"}
        title={"Network connection error"}
      />
    );
  }

  if (spam) {
    return (
      <TextBanner
        type={"danger"}
        title={"You marked this account as spam"}
        buttonText={"Undo"}
        onClick={async () => {
          await fetch(`${BACKEND_API_URL}/friends/spam`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ to: remoteUserId, spam: false }),
          });
          setSpam(false);
        }}
      />
    );
  }

  if (blocked) {
    return (
      <TextBanner type={"normal"} title={"You have blocked this account"} />
    );
  }

  if (areFriends) {
    return <div></div>;
  }

  if (requested) {
    return <TextBanner type={"disabled"} title={"Contact requested"} />;
  }

  return (
    <div>
      {!areFriends && (
        <div
          className={`${classes.noContactBanner} ${classes.horizontalCenter} ${classes.text}`}
        >
          {!requested && (
            <div
              className={classes.strongText}
              style={{ cursor: "pointer", marginRight: 25 }}
              onClick={async () => {
                await sendFriendRequest({
                  to: remoteUserId,
                  sendRequest: true,
                });
                setRequested(true);
                toast.success(
                  remoteRequested
                    ? "You both said hot 🔥"
                    : "Contact requested",
                  remoteRequested
                    ? "Just kidding! You are now mutual contacts."
                    : `We'll let ${remoteUsername} know you want to connect.`
                );
              }}
            >
              {remoteRequested ? "Accept Contact Request" : "Add to contacts"}
            </div>
          )}
          <div
            className={classes.strongText}
            style={{ cursor: "pointer" }}
            onClick={async () => {
              await fetch(`${BACKEND_API_URL}/friends/spam`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ to: remoteUserId, spam: true }),
              });
              setSpam(true);
              toast.success("Spam", "Marked user as spam");
            }}
          >
            Mark as Spam
          </div>
          <br />
        </div>
      )}
    </div>
  );
};

function TextBanner({
  title,
  buttonText,
  onClick,
  type,
  fixed = false,
}: {
  title: String;
  buttonText?: string;
  onClick?: () => void;
  type: "danger" | "normal" | "disabled";
  fixed?: boolean;
}) {
  const theme = useCustomTheme();
  const classes = useStyles({ type });
  return (
    <div style={fixed ? { position: "absolute", top: 0, width: "100%" } : {}}>
      <div
        className={`${classes.noContactBanner} ${classes.horizontalCenter} ${classes.text}`}
        style={{
          color:
            type === "disabled" ? theme.custom.colors.fontColor3 : "inherit",
          fontSize: 14,
        }}
      >
        {" "}
        {type !== "disabled" && (
          <InfoIcon
            style={{
              color:
                type === "danger"
                  ? theme.custom.colors.negative
                  : theme.custom.colors.fontColor,
              marginRight: 5,
            }}
          />
        )}{" "}
        <div style={{ marginTop: type !== "disabled" ? 1 : 0 }}>
          {title}
          {buttonText && (
            <div
              style={{ marginLeft: 10, cursor: "pointer" }}
              onClick={onClick}
            >
              {buttonText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
