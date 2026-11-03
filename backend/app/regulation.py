"""Course catalogue from the 2023 Regulations: BE CSE and BE CSE (AI&ML).

Transcribed from each programme's regulation document (section 13, "Courses
of Study and Scheme of Assessment", and the elective lists that follow it).
L-T-P-C values for electives come from each course's syllabus page.

Not included: the Induction Programme and Activity Point Programme (no
teaching hours), the elective placeholder rows ("Professional Elective - 1"
and so on), and the self-directed learning courses (23IC01, 23IC02).

Electives that can run in more than one semester have ``semester=None``.
Language electives are offered in Semester II. Open electives offered by other
departments are added by an administrator (``source="manual"``).

A course that both programmes teach identically (same name, semester,
category and L-T-P-C) is one entry whose code joins both codes, CSE first:
``23Z402/23N402``. Courses that share a name but differ, such as Operating
Systems (23Z501 in Semester V, 23N404 in Semester IV), stay separate.
"""

from __future__ import annotations

from typing import Any

REGULATION = "2023"
CSE = "BE CSE"
AIML = "BE CSE (AI&ML)"
PROGRAMMES = (CSE, AIML)
PROGRAMME_SHORT_NAMES = {CSE: "CSE", AIML: "AI&ML"}

CATEGORY_LABELS = {
    "BS": "Basic Science",
    "HS": "Humanities and Social Sciences",
    "ES": "Engineering Sciences",
    "PC": "Professional Core",
    "PE": "Professional Elective",
    "OE": "Open Elective",
    "EEC": "Employability Enhancement Course",
    "MC": "Mandatory Course",
}


def _course(
    code: str,
    name: str,
    semester: int | None,
    category: str,
    ltpc: tuple[int, int, int, int],
    elective_group: str | None = None,
) -> dict[str, Any]:
    lecture, tutorial, practical, credits = ltpc
    return {
        "code": code,
        "name": name,
        "semester": semester,
        "category": category,
        "lecture": lecture,
        "tutorial": tutorial,
        "practical": practical,
        "credits": credits,
        "elective_group": elective_group,
    }


CSE_COURSES = [
    _course("23Z101", "Calculus and its Applications", 1, "BS", (3, 1, 0, 4)),
    _course(
        "23Z102",
        "Basics of Electrical and Electronic Systems",
        1,
        "ES",
        (3, 0, 0, 3),
    ),
    _course("23Z103", "Applied Chemistry", 1, "BS", (3, 0, 0, 3)),
    _course("23Z104", "Computational Thinking", 1, "ES", (3, 1, 0, 4)),
    _course("23G105", "English Language Proficiency", 1, "HS", (3, 1, 0, 4)),
    _course("23Z110", "Python Programming Laboratory", 1, "ES", (0, 0, 4, 2)),
    _course("23Z111", "Basic Science Laboratory", 1, "BS", (0, 0, 4, 2)),
    _course("23Z201", "Transforms and its Applications", 2, "BS", (3, 1, 0, 4)),
    _course("23Z202", "Sensors for Engineering Applications", 2, "BS", (3, 1, 0, 4)),
    _course("23Z203", "Digital Design", 2, "ES", (3, 0, 0, 3)),
    _course("23Z204", "C Programming", 2, "ES", (3, 0, 0, 3)),
    _course("23Z211", "Engineering Practices", 2, "EEC", (0, 0, 4, 2)),
    _course("23Z212", "C Programming Laboratory", 2, "ES", (0, 0, 4, 2)),
    _course("23Z214", "Engineering Graphics", 2, "ES", (0, 0, 2, 1)),
    _course("23Q213", "Foundations for Problem Solving", 2, "MC", (0, 0, 2, 0)),
    _course("23Z301", "Linear Algebra", 3, "BS", (3, 1, 0, 4)),
    _course("23Z302", "Computer Organization and Architecture", 3, "ES", (3, 1, 0, 4)),
    _course("23Z303", "Data Structures", 3, "PC", (3, 0, 0, 3)),
    _course("23Z304", "Discrete Structures", 3, "BS", (3, 1, 0, 4)),
    _course("23O305", "Engineering Economics", 3, "HS", (3, 1, 0, 4)),
    _course("23Z310", "Object Oriented Programming Laboratory", 3, "ES", (0, 0, 4, 2)),
    _course("23Z311", "Data Structures Laboratory", 3, "PC", (0, 0, 4, 2)),
    _course("23Q313", "Building Communication Skills", 3, "EEC", (0, 0, 2, 1)),
    _course("23K312", "Environmental Science", 3, "MC", (2, 0, 0, 0)),
    _course("23TC01", "Heritage of Tamils", 3, "HS", (1, 0, 0, 1)),
    _course(
        "23Z401",
        "Probability, Stochastic Processes and Statistics",
        4,
        "BS",
        (3, 1, 0, 4),
    ),
    _course("23Z402", "Database Management Systems", 4, "PC", (3, 0, 0, 3)),
    _course("23Z403", "Design and Analysis of Algorithms", 4, "PC", (3, 1, 0, 4)),
    _course("23Z404", "Theory of Computation", 4, "PC", (3, 1, 0, 4)),
    _course("23Z405", "Software Engineering", 4, "PC", (3, 1, 0, 4)),
    _course("23Z410", "Database Management Systems Laboratory", 4, "PC", (0, 0, 4, 2)),
    _course("23Z411", "Application Development Laboratory", 4, "EEC", (0, 0, 4, 2)),
    _course("23Q413", "Problem Solving", 4, "EEC", (0, 0, 2, 1)),
    _course("23O414", "Indian Constitution", 4, "MC", (2, 0, 0, 0)),
    _course("23TC02", "Tamils and Technology", 4, "HS", (1, 0, 0, 1)),
    _course("23Z501", "Operating Systems", 5, "PC", (3, 0, 0, 3)),
    _course("23Z502", "Artificial Intelligence", 5, "PC", (3, 1, 0, 4)),
    _course("23Z503", "Compiler Design", 5, "PC", (3, 1, 0, 4)),
    _course("23Z504", "Computer Networks", 5, "PC", (3, 0, 0, 3)),
    _course("23Z510", "Computer Networks Laboratory", 5, "PC", (0, 0, 4, 2)),
    _course("23Z511", "System Software Laboratory", 5, "PC", (0, 0, 4, 2)),
    _course("23Q513", "Aptitude Skills", 5, "EEC", (0, 0, 2, 1)),
    _course("23Z601", "Machine Learning", 6, "PC", (3, 0, 0, 3)),
    _course("23Z602", "Graph Theory", 6, "PC", (3, 1, 0, 4)),
    _course("23Z603", "Embedded Systems", 6, "ES", (2, 2, 0, 4)),
    _course("23Z610", "Machine Learning Laboratory", 6, "PC", (0, 0, 4, 2)),
    _course("23Z611", "Innovation Practices", 6, "EEC", (0, 0, 2, 1)),
    _course("23Q614", "Enhancing Arithmetic Problem Solving", 6, "EEC", (0, 0, 2, 1)),
    _course("23Z701", "Parallel and Distributed Systems", 7, "PC", (3, 0, 0, 3)),
    _course("23Z702", "Cryptography and Network Security", 7, "PC", (3, 1, 0, 4)),
    _course(
        "23Z710",
        "Parallel and Distributed Systems Laboratory",
        7,
        "PC",
        (0, 0, 4, 2),
    ),
    _course("23Z720", "Project Work - I", 7, "EEC", (0, 0, 4, 2)),
    _course("23Z820", "Project Work - II", 8, "EEC", (0, 0, 8, 4)),
    _course(
        "23G001",
        "Communication Skills for Engineers",
        2,
        "HS",
        (0, 0, 4, 2),
        "Language Elective",
    ),
    _course("23G002", "Basic German", 2, "HS", (0, 0, 4, 2), "Language Elective"),
    _course("23G003", "Basic French", 2, "HS", (0, 0, 4, 2), "Language Elective"),
    _course("23G004", "Basic Japanese", 2, "HS", (0, 0, 4, 2), "Language Elective"),
    _course(
        "23Z001",
        "Software Testing and Quality Assurance",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z002",
        "Software Project Management",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z003",
        "Object Oriented System Development",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z004",
        "Agile Software Development",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z005",
        "Open Source Technology",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z006",
        "Human Computer Interaction",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z007",
        "Information Security",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z008",
        "Full Stack Development",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course("23Z009", "DevOps", None, "PE", (3, 0, 0, 3), "Professional Elective"),
    _course(
        "23Z010",
        "Advanced Data Structures",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z011",
        "UNIX Internals",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z012",
        "Big Data and Advanced Database Systems",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z013",
        "Blockchain Technology",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z014",
        "Cloud Computing",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z015",
        "Networking Technologies",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z016",
        "Internet of Things",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z017",
        "Generative AI",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23Z031",
        "Data Exploration and Visualization",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z032",
        "Information Retrieval",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z033",
        "Evolutionary Computing Algorithms",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z034",
        "Natural Language Processing",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z035",
        "Recommender Systems",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z036",
        "Deep Learning",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z037",
        "Computer Vision",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z038",
        "Cognitive Analytics",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Computational Intelligence",
    ),
    _course(
        "23Z041",
        "Virtualization",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Networking Technologies",
    ),
    _course(
        "23Z042",
        "Wireless Networks",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Networking Technologies",
    ),
    _course(
        "23Z043",
        "Edge Computing",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Networking Technologies",
    ),
    _course(
        "23Z044",
        "Software Defined Networks",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Networking Technologies",
    ),
    _course(
        "23Z045",
        "Network Optimization",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Networking Technologies",
    ),
    _course(
        "23Z046",
        "Network Management & Security",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Networking Technologies",
    ),
    _course(
        "23Z051",
        "Cyber Security and Digital Forensics",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical III: Security and Privacy",
    ),
    _course(
        "23Z052",
        "Cloud Security",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical III: Security and Privacy",
    ),
    _course(
        "23Z053",
        "Privacy Preserving Data Mining",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical III: Security and Privacy",
    ),
    _course(
        "23Z054",
        "Privacy and Security in Online Social Networks",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical III: Security and Privacy",
    ),
    _course(
        "23Z055",
        "Malware Analysis",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical III: Security and Privacy",
    ),
    _course(
        "23Z056",
        "Quantum-Safe Cryptography",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical III: Security and Privacy",
    ),
    _course("23ZO01", "Bioinformatics", None, "OE", (3, 0, 0, 3), "Open Elective"),
    _course("23ZO02", "Design Thinking", None, "OE", (3, 0, 0, 3), "Open Elective"),
    _course(
        "23ZO03",
        "Intellectual Property Rights",
        None,
        "OE",
        (3, 0, 0, 3),
        "Open Elective",
    ),
    _course(
        "23ZO04",
        "Social and Economic Network Analysis",
        None,
        "OE",
        (3, 0, 0, 3),
        "Open Elective",
    ),
]


AIML_COURSES = [
    _course("23N101", "Calculus and its Applications", 1, "BS", (3, 1, 0, 4)),
    _course(
        "23N102",
        "Basics of Electrical and Electronic Systems",
        1,
        "ES",
        (3, 0, 0, 3),
    ),
    _course("23N103", "Applied Chemistry", 1, "BS", (3, 0, 0, 3)),
    _course("23N104", "Computational Thinking", 1, "ES", (3, 1, 0, 4)),
    _course("23G105", "English Language Proficiency", 1, "HS", (3, 1, 0, 4)),
    _course("23N110", "Python Programming Laboratory", 1, "ES", (0, 0, 4, 2)),
    _course("23N111", "Basic Science Laboratory", 1, "BS", (0, 0, 4, 2)),
    _course("23N112", "Engineering Practices", 1, "EEC", (0, 0, 4, 2)),
    _course("23N201", "Transforms and its Applications", 2, "BS", (3, 1, 0, 4)),
    _course("23N202", "Discrete Mathematics", 2, "BS", (3, 1, 0, 4)),
    _course("23N203", "Computer Organization and Architecture", 2, "ES", (3, 0, 0, 3)),
    _course("23N204", "C Programming", 2, "ES", (3, 0, 0, 3)),
    _course("23N211", "Hardware Programming Laboratory", 2, "ES", (0, 0, 4, 2)),
    _course("23N212", "C Programming Laboratory", 2, "ES", (0, 0, 4, 2)),
    _course("23N214", "Engineering Graphics", 2, "ES", (0, 0, 2, 1)),
    _course("23Q213", "Foundations for Problem Solving", 2, "MC", (0, 0, 2, 0)),
    _course("23N301", "Linear Algebra", 3, "BS", (3, 1, 0, 4)),
    _course(
        "23N302",
        "Probability, Stochastic Processes and Statistics",
        3,
        "BS",
        (3, 1, 0, 4),
    ),
    _course("23N303", "Data Structures", 3, "PC", (3, 0, 0, 3)),
    _course("23N304", "Software Engineering", 3, "PC", (3, 0, 0, 3)),
    _course("23O305", "Engineering Economics", 3, "HS", (3, 1, 0, 4)),
    _course("23N310", "Object Oriented Programming Laboratory", 3, "ES", (0, 0, 4, 2)),
    _course("23N311", "Data Structures Laboratory", 3, "PC", (0, 0, 4, 2)),
    _course("23Q313", "Building Communication Skills", 3, "EEC", (0, 0, 2, 1)),
    _course("23K312", "Environmental Science", 3, "MC", (2, 0, 0, 0)),
    _course("23TC01", "Heritage of Tamils", 3, "HS", (1, 0, 0, 1)),
    _course("23N401", "Foundations of Optimization Techniques", 4, "BS", (3, 1, 0, 4)),
    _course("23N402", "Database Management Systems", 4, "PC", (3, 0, 0, 3)),
    _course("23N403", "Design and Analysis of Algorithms", 4, "PC", (3, 1, 0, 4)),
    _course("23N404", "Operating Systems", 4, "PC", (3, 1, 0, 4)),
    _course("23N405", "Machine Learning -1", 4, "PC", (3, 0, 0, 3)),
    _course("23N410", "Database Management Systems Laboratory", 4, "PC", (0, 0, 4, 2)),
    _course("23N411", "Machine Learning Laboratory", 4, "PC", (0, 0, 4, 2)),
    _course("23Q413", "Problem Solving", 4, "EEC", (0, 0, 2, 1)),
    _course("23O414", "Indian Constitution", 4, "MC", (2, 0, 0, 0)),
    _course("23TC02", "Tamils and Technology", 4, "HS", (1, 0, 0, 1)),
    _course("23N501", "Machine Learning -2", 5, "PC", (3, 1, 0, 4)),
    _course("23N502", "Artificial Intelligence", 5, "PC", (3, 1, 0, 4)),
    _course("23N503", "Embedded Systems", 5, "ES", (2, 2, 0, 4)),
    _course("23N504", "Computer Networks", 5, "PC", (3, 0, 0, 3)),
    _course("23N510", "Computer Networks Laboratory", 5, "PC", (0, 0, 4, 2)),
    _course("23N511", "Application Development Laboratory", 5, "EEC", (0, 0, 4, 2)),
    _course("23Q513", "Aptitude Skills", 5, "EEC", (0, 0, 2, 1)),
    _course("23N601", "Data Privacy and Security", 6, "PC", (3, 1, 0, 4)),
    _course("23N602", "Parallel and Distributed Systems", 6, "PC", (3, 1, 0, 4)),
    _course("23N603", "Deep Learning", 6, "PC", (3, 0, 0, 3)),
    _course("23N604", "Natural Language Processing", 6, "PC", (3, 0, 0, 3)),
    _course("23N610", "Deep Learning Laboratory", 6, "PC", (0, 0, 4, 2)),
    _course("23N611", "Innovation Practices", 6, "EEC", (0, 0, 2, 1)),
    _course("23Q613", "Enhancing Arithmetic Problem Solving", 6, "EEC", (0, 0, 2, 1)),
    _course("23N701", "Big Data and Advanced Database Systems", 7, "PC", (3, 0, 0, 3)),
    _course(
        "23N710",
        "Big Data and Advanced Database Systems Laboratory",
        7,
        "PC",
        (0, 0, 4, 2),
    ),
    _course("23N720", "Project Work - I", 7, "EEC", (0, 0, 4, 2)),
    _course("23N820", "Project Work - II", 8, "EEC", (0, 0, 8, 4)),
    _course(
        "23G001",
        "Communication Skills for Engineers",
        2,
        "HS",
        (0, 0, 4, 2),
        "Language Elective",
    ),
    _course("23G002", "Basic German", 2, "HS", (0, 0, 4, 2), "Language Elective"),
    _course("23G003", "Basic French", 2, "HS", (0, 0, 4, 2), "Language Elective"),
    _course("23G004", "Basic Japanese", 2, "HS", (0, 0, 4, 2), "Language Elective"),
    _course(
        "23N001",
        "Software Testing and Quality Assurance",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N002",
        "Software Project Management",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N003",
        "Recommender Systems",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N004",
        "Agile Software Development",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N005",
        "Open Source Technology",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N006",
        "Human Computer Interaction",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N007",
        "Information Retrieval",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N008",
        "Full Stack Development",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course("23N009", "DevOps", None, "PE", (3, 0, 0, 3), "Professional Elective"),
    _course(
        "23N010",
        "Advanced Data Structures",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N011",
        "Ethical Hacking",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N012",
        "Compiler Design",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N013",
        "Blockchain Technology",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N014",
        "Cloud Computing",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N015",
        "Data Exploration and Visualization",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N016",
        "Internet of Things",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N017",
        "Computer Vision",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N018",
        "Evolutionary Computing Algorithms",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N019",
        "Neuro Fuzzy System",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N020",
        "Generative AI",
        None,
        "PE",
        (3, 0, 0, 3),
        "Professional Elective",
    ),
    _course(
        "23N031",
        "Virtualization",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N032",
        "Edge Computing",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N033",
        "Network Design",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N034",
        "Software Defined Networks",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N035",
        "Semantic Web Technology",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N036",
        "Speech Processing",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N037",
        "Cognitive Analytics",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N038",
        "Augmented Reality",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N039",
        "Robotics",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N040",
        "Network Optimization",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N046",
        "Network Management & Security",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical I: Cyber-Physical Systems",
    ),
    _course(
        "23N041",
        "Information Security",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Security and Privacy",
    ),
    _course(
        "23N042",
        "Cyber Security and Digital Forensics",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Security and Privacy",
    ),
    _course(
        "23N043",
        "Web Services and Security",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Security and Privacy",
    ),
    _course(
        "23N044",
        "Privacy and Security in Online Social Networks",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Security and Privacy",
    ),
    _course(
        "23N045",
        "Malware Analysis",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Security and Privacy",
    ),
    _course(
        "23N047",
        "Quantum-Safe Cryptography",
        None,
        "PE",
        (3, 0, 0, 3),
        "Vertical II: Security and Privacy",
    ),
    _course("23NO01", "Bioinformatics", None, "OE", (3, 0, 0, 3), "Open Elective"),
    _course("23NO02", "Design Thinking", None, "OE", (3, 0, 0, 3), "Open Elective"),
    _course(
        "23NO03",
        "Ethics of Artificial Intelligence",
        None,
        "OE",
        (3, 0, 0, 3),
        "Open Elective",
    ),
    _course("23NO04", "Graph Theory", None, "OE", (3, 0, 0, 3), "Open Elective"),
    _course(
        "23NO05",
        "Intellectual Property Rights",
        None,
        "OE",
        (3, 0, 0, 3),
        "Open Elective",
    ),
    _course(
        "23NO06",
        "Social and Economic Network Analysis",
        None,
        "OE",
        (3, 0, 0, 3),
        "Open Elective",
    ),
]

GENERIC_GROUPS = {"Professional Elective", "Open Elective", "Language Elective"}


def _match_key(course: dict[str, Any]) -> tuple:
    name = " ".join(course["name"].replace("-", " ").split()).casefold()
    return (
        name,
        course["semester"],
        course["category"],
        course["lecture"],
        course["tutorial"],
        course["practical"],
        course["credits"],
    )


def _merged_group(cse_group: str | None, aiml_group: str | None) -> str | None:
    """One label for a shared elective listed under different groups."""
    if cse_group == aiml_group:
        return cse_group
    specific = [
        f"{group} ({PROGRAMME_SHORT_NAMES[programme]})"
        for programme, group in ((CSE, cse_group), (AIML, aiml_group))
        if group and group not in GENERIC_GROUPS
    ]
    return " / ".join(specific) or cse_group or aiml_group


def _merge_programmes(
    cse_courses: list[dict[str, Any]], aiml_courses: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Combine both programmes' lists, joining courses they teach identically.

    Each entry gains ``codes`` (every code the course is known by) and
    ``programmes`` (the programmes that teach it).
    """
    aiml_by_key = {_match_key(course): course for course in aiml_courses}
    matched: set[str] = set()
    merged = []
    for course in cse_courses:
        twin = aiml_by_key.get(_match_key(course))
        if twin is None:
            merged.append({**course, "codes": [course["code"]], "programmes": [CSE]})
            continue
        matched.add(twin["code"])
        codes = list(dict.fromkeys([course["code"], twin["code"]]))
        merged.append(
            {
                **course,
                "code": "/".join(codes),
                "elective_group": _merged_group(
                    course["elective_group"], twin["elective_group"]
                ),
                "codes": codes,
                "programmes": [CSE, AIML],
            }
        )
    merged.extend(
        {**course, "codes": [course["code"]], "programmes": [AIML]}
        for course in aiml_courses
        if course["code"] not in matched
    )
    return merged


REGULATION_COURSES = _merge_programmes(CSE_COURSES, AIML_COURSES)
