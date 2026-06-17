import streamlit as st


def inject_mobile_css():
    """Inject responsive mobile CSS for all Streamlit pages."""
    st.markdown(
        """
<style>
@media (max-width: 640px) {

    /* --- Columns: stack vertically --- */
    [data-testid="column"] {
        min-width: 100% !important;
        width: 100% !important;
        flex: 1 1 100% !important;
    }

    /* Flex container for columns */
    [data-testid="stHorizontalBlock"] {
        flex-wrap: wrap !important;
    }

    /* --- Buttons: full width --- */
    .stButton > button {
        width: 100% !important;
        margin-bottom: 0.4rem;
    }

    .stDownloadButton > button {
        width: 100% !important;
        margin-bottom: 0.4rem;
    }

    .stFormSubmitButton > button {
        width: 100% !important;
    }

    /* --- Inputs and selects: full width --- */
    .stTextInput input {
        max-width: 100% !important;
    }

    .stTextArea textarea {
        max-width: 100% !important;
        overflow-x: auto;
    }

    .stSelectbox {
        max-width: 100% !important;
    }

    .stMultiSelect {
        max-width: 100% !important;
    }

    /* --- Code blocks: horizontal scroll --- */
    .stCode, pre, code {
        max-width: 100% !important;
        overflow-x: auto !important;
        white-space: pre-wrap !important;
        word-break: break-word;
    }

    /* --- Expanders --- */
    [data-testid="stExpander"] {
        max-width: 100% !important;
        overflow-x: auto;
    }

    /* --- Markdown blocks --- */
    .stMarkdown {
        max-width: 100% !important;
        overflow-x: auto;
    }

    /* --- Tables --- */
    table {
        display: block !important;
        overflow-x: auto !important;
        max-width: 100% !important;
        white-space: nowrap;
    }

    /* --- Metric cards: stack and shrink --- */
    [data-testid="stMetric"] {
        min-width: 100% !important;
    }

    /* --- Tabs: allow wrapping --- */
    .stTabs [data-baseweb="tab-list"] {
        flex-wrap: wrap !important;
        gap: 0.25rem;
    }

    .stTabs [data-baseweb="tab"] {
        font-size: 0.8rem !important;
        padding: 0.35rem 0.6rem !important;
    }

    /* --- Slightly reduce font sizes --- */
    h1 {
        font-size: 1.6rem !important;
    }

    h2 {
        font-size: 1.3rem !important;
    }

    h3 {
        font-size: 1.1rem !important;
    }

    p, .stMarkdown p, li {
        font-size: 0.92rem !important;
    }

    /* --- Sidebar: ensure no overflow on wide-layout pages --- */
    section[data-testid="stSidebar"] {
        max-width: 80vw !important;
    }

    /* --- Main content area: prevent overflow --- */
    .main .block-container {
        padding-left: 0.75rem !important;
        padding-right: 0.75rem !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
    }

    /* --- Charts and plots --- */
    [data-testid="stVegaLiteChart"],
    [data-testid="stArrowVegaLiteChart"],
    iframe {
        max-width: 100% !important;
        overflow-x: auto;
    }

    /* --- Page links / nav --- */
    [data-testid="stPageLink"] {
        width: 100% !important;
        display: block !important;
    }

    /* --- Radio buttons: wrap on mobile --- */
    .stRadio [data-testid="stWidgetLabel"] + div {
        flex-wrap: wrap !important;
    }

    /* --- Sliders: full width --- */
    .stSlider {
        max-width: 100% !important;
    }

    /* --- Progress bars --- */
    .stProgress {
        max-width: 100% !important;
    }
}
</style>
""",
        unsafe_allow_html=True,
    )
